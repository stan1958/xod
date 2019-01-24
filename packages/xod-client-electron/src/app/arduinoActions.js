import * as R from 'ramda';

import { rejectWithCode, delay } from 'xod-func-tools';
import * as xd from 'xod-deploy';
import {
  createSystemMessage,
  parseDebuggerMessage,
  createErrorMessage,
} from 'xod-client/dist/debugger/debugProtocol';

import * as settings from './settings';
import * as MESSAGES from '../shared/messages';
import * as ERROR_CODES from '../shared/errorCodes';
import * as EVENTS from '../shared/events';

// =============================================================================
//
// Utils
//
// =============================================================================

/**
 * Returns a target Board.
 * It tries to take a value from Settings, if it doesn't exist
 * it will just return Null
 */
// :: () -> Nullable Board
export const loadTargetBoard = () =>
  R.compose(
    R.when(R.either(R.isNil, R.isEmpty), R.always(null)),
    settings.getUploadTarget,
    settings.load
  )();

/**
 * Saves a specified Board into Settings and returns itself.
 */
export const saveTargetBoard = board =>
  R.compose(
    R.always(board),
    settings.save,
    settings.setUploadTarget(board),
    settings.load
  )();

// =============================================================================
//
// Upload actions
//
// =============================================================================

/**
 * Gets list of all serial ports
 * @returns {Promise<Object, Error>} Promise with Port object or Error
 * @see {@link https://www.npmjs.com/package/serialport#listing-ports}
 */
export const listPorts = () =>
  xd
    .listPorts()
    .then(R.sort(R.descend(R.prop('comName'))))
    .catch(rejectWithCode(ERROR_CODES.NO_PORTS_FOUND));

// :: Port -> [Port] -> Boolean
const hasPort = R.curry((port, ports) =>
  R.compose(R.gt(R.__, -1), R.findIndex(R.propEq('comName', port.comName)))(
    ports
  )
);

/**
 * Validates that port is exist and returns Promise with the same Port object
 * or Rejected Promise with Error Code and object, that contain port
 * and list of available ports.
 */
export const checkPort = port =>
  listPorts()
    .then(
      R.ifElse(hasPort(port), R.always(port), ports => {
        throw Object.assign(new Error(`Port ${port.comName} not found`), {
          port,
          ports,
        });
      })
    )
    .catch(rejectWithCode(ERROR_CODES.PORT_NOT_FOUND));

// =============================================================================
//
// Debug
//
// =============================================================================

const debug = async (port, onData, onClose) => {
  const ports = await xd.listPorts();
  const newPort = R.find(
    R.allPass([
      R.propEq('manufacturer', port.manufacturer),
      R.propEq('vendorId', port.vendorId),
      R.propEq('serialNumber', port.serialNumber),
      R.propEq('productId', port.productId),
    ]),
    ports
  );

  if (!newPort) {
    return rejectWithCode(
      ERROR_CODES.DEVICE_NOT_FOUND_FOR_DEBUG,
      new Error('Device for debug is not found')
    );
  }

  const portName = R.prop('comName', port);

  return delay(400).then(() => xd.openAndReadPort(portName, onData, onClose));
};

const isDeviceNotFound = R.propEq(
  'errorCode',
  ERROR_CODES.DEVICE_NOT_FOUND_FOR_DEBUG
);

// =============================================================================
//
// IPC handlers (for main process)
//
// =============================================================================

/**
 * Handler for starting debug session.
 * - `storeFn`   - is a function, that used to store reference to port,
 *                 to close connection with it on next upload or on stop
 *                 debug session
 * - `onCloseCb` - is a function, that called on any "close" event occured
 *                 on SerialPort object. It called one argument:
 *                 - `sendErr` function, that send error "Lost connection",
 *                   only main process knows is connection closed by user or
 *                   really error occured, so it's passed as argument and
 *                   called in the main process.
 */
export const startDebugSessionHandler = (storeFn, onCloseCb) => (
  event,
  { port }
) => {
  let triesToSearchDevice = 0;
  const maxTriesToSearch = 7;
  const searchDelay = 300;

  let messageCollector = [];
  const throttleDelay = 100; // ms

  const intervalId = setInterval(() => {
    if (messageCollector.length > 0) {
      event.sender.send(EVENTS.DEBUG_SESSION, messageCollector);
      messageCollector = [];
    }
  }, throttleDelay);

  const onData = data => {
    messageCollector = R.append(parseDebuggerMessage(data), messageCollector);
  };
  const onClose = () => {
    clearInterval(intervalId);
    onCloseCb(() => {
      const errorMessage = R.compose(
        R.omit('stack'), // Lost connection is not a big deal, we don't want a stacktrace here
        createErrorMessage
      )(new Error(MESSAGES.DEBUG_LOST_CONNECTION));
      event.sender.send(EVENTS.DEBUG_SESSION, [errorMessage]);
    });
    event.sender.send(
      EVENTS.STOP_DEBUG_SESSION,
      createSystemMessage('Debug session stopped')
    );
  };

  const runDebug = () =>
    debug(port, onData, onClose).catch(async err => {
      if (triesToSearchDevice >= maxTriesToSearch || !isDeviceNotFound(err)) {
        return err;
      }

      triesToSearchDevice += 1;
      await delay(searchDelay);
      return await runDebug();
    });

  return runDebug()
    .then(R.tap(debugPort => storeFn(debugPort, intervalId)))
    .catch(err => {
      clearInterval(intervalId);
      event.sender.send(EVENTS.DEBUG_SESSION, [createErrorMessage(err)]);
    });
};

export const stopDebugSessionHandler = (event, port) => xd.closePort(port);

export const listPortsHandler = event =>
  listPorts()
    .then(ports =>
      event.sender.send(EVENTS.LIST_PORTS, {
        err: false,
        data: ports,
      })
    )
    .catch(err =>
      event.sender.send(EVENTS.LIST_PORTS, {
        err: true,
        data: err,
      })
    );

export const loadTargetBoardHandler = event =>
  event.sender.send(EVENTS.GET_SELECTED_BOARD, {
    err: false,
    data: loadTargetBoard(),
  });

export const saveTargetBoardHandler = (event, payload) =>
  event.sender.send(EVENTS.SET_SELECTED_BOARD, {
    err: false,
    data: saveTargetBoard(payload),
  });
