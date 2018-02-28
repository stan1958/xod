import * as R from 'ramda';
import React from 'react';
import PropTypes from 'prop-types';
import throttle from 'throttle-debounce/throttle';
import cn from 'classnames';
import $ from 'sanctuary-def';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import ReactResizeDetector from 'react-resize-detector';

import * as EditorActions from '../../actions';
import * as ProjectActions from '../../../project/actions';
import * as DebuggerActions from '../../../debugger/actions';

import * as EditorSelectors from '../../selectors';
import * as ProjectSelectors from '../../../project/selectors';
import * as DebugSelectors from '../../../debugger/selectors';

import { RenderableLink, RenderableNode, RenderableComment } from '../../../types';
import sanctuaryPropType from '../../../utils/sanctuaryPropType';

import dropTarget from './dropTarget';

import { EDITOR_MODE, TAB_TYPES, FOCUS_AREAS } from '../../constants';

import selectingMode from './modes/selecting';
import linkingMode from './modes/linking';
import panningMode from './modes/panning';
import movingMode from './modes/moving';
import resizingCommentMode from './modes/resizingComment';
import acceptingDraggedPatchMode from './modes/acceptingDraggedPatch';
import debuggingMode from './modes/debugging';
import marqueeSelectingMode from './modes/marqueeSelecting';
import changingArityLevelMode from './modes/changingArityLevel';

const MODE_HANDLERS = {
  [EDITOR_MODE.DEFAULT]: selectingMode,
  [EDITOR_MODE.LINKING]: linkingMode,
  [EDITOR_MODE.PANNING]: panningMode,
  [EDITOR_MODE.MOVING_SELECTION]: movingMode,
  [EDITOR_MODE.RESIZING_COMMENT]: resizingCommentMode,
  [EDITOR_MODE.ACCEPTING_DRAGGED_PATCH]: acceptingDraggedPatchMode,
  [EDITOR_MODE.DEBUGGING]: debuggingMode,
  [EDITOR_MODE.MARQUEE_SELECTING]: marqueeSelectingMode,
  [EDITOR_MODE.CHANGING_ARITY_LEVEL]: changingArityLevelMode,
};

const DEFAULT_MODES = {
  [TAB_TYPES.PATCH]: EDITOR_MODE.DEFAULT,
  [TAB_TYPES.DEBUGGER]: EDITOR_MODE.DEBUGGING,
};

const mergeLeft = R.flip(R.merge);

class Patch extends React.Component {
  constructor(props) {
    super(props);

    const mode = DEFAULT_MODES[props.tabType];

    this.state = {
      currentMode: mode,
      modeSpecificState: {
        [mode]: MODE_HANDLERS[mode].getInitialState(props),
      },
    };

    this.goToMode = this.goToMode.bind(this);
    this.goToDefaultMode = this.goToDefaultMode.bind(this);
    this.getModeState = this.getModeState.bind(this);
    this.setModeState = this.setModeState.bind(this);
    this.setModeStateThrottled = throttle(100, true, this.setModeState);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.tabType != null && this.props.tabType !== nextProps.tabType) {
      this.goToMode(DEFAULT_MODES[nextProps.tabType]);
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.focusedArea !== prevProps.focusedArea &&
      this.props.focusedArea === FOCUS_AREAS.WORKAREA
    ) {
      this.dropTargetRootRef.firstChild.focus();
    }

    // patch was dragged out
    if (!this.props.isPatchDraggedOver && prevProps.isPatchDraggedOver) {
      this.goToDefaultMode();
    }
  }

  getApi(mode) {
    return {
      props: this.props,
      getCurrentMode: () => this.state.currentMode,
      state: this.getModeState(mode),
      setState: R.partial(this.setModeState, [mode]),
      goToMode: this.goToMode,
      goToDefaultMode: this.goToDefaultMode,
    };
  }

  getModeState(mode) {
    return R.pathOr({}, ['modeSpecificState', mode], this.state);
  }

  setModeState(mode, newModeSpecificState, callback) {
    // TODO: suport passing state updater fn instead of object?

    const statePath = ['modeSpecificState', mode];

    this.setState(
      R.compose(
        R.over(
          R.lens(R.pathOr({}, statePath), R.assocPath(statePath)),
          mergeLeft(newModeSpecificState)
        ),
        R.assoc('currentMode', mode)
      ),
      callback
    );
  }

  goToMode(newMode, payload) {
    const newModeState = MODE_HANDLERS[newMode].getInitialState(this.props, payload);
    this.setModeState(newMode, newModeState);
  }

  goToDefaultMode(payload) {
    const { tabType } = this.props;
    this.goToMode(DEFAULT_MODES[tabType], payload);
  }

  render() {
    const { currentMode } = this.state;
    /**
     * Some Modes could need more data from Project, than we
     * have in this Container.
     * (See `changingArityLevel.jsx`)
     *
     * For this purposes we have to get Project, but for better
     * performance we do not include it into Props to prevent
     * excessive updates and renders, but get it right from
     * context and pass into render function of Modes.
     */
    const project = ProjectSelectors.getProject(this.context.store.getState());

    return this.props.connectDropTarget(
      <div
        className={cn('PatchWrapper-container', currentMode)}
        ref={(r) => { this.dropTargetRootRef = r; }}
      >
        <ReactResizeDetector
          handleWidth
          handleHeight
          onResize={this.props.actions.patchWorkareaResized}
        />
        {MODE_HANDLERS[currentMode].render(
          this.getApi(currentMode),
          project
        )}
      </div>
    );
  }
}

Patch.contextTypes = {
  store: PropTypes.object,
};

Patch.propTypes = {
  /* eslint-disable react/no-unused-prop-types */
  size: PropTypes.any.isRequired,
  actions: PropTypes.objectOf(PropTypes.func),
  nodes: sanctuaryPropType($.StrMap(RenderableNode)),
  links: sanctuaryPropType($.StrMap(RenderableLink)),
  comments: sanctuaryPropType($.StrMap(RenderableComment)),
  linkingPin: PropTypes.object,
  selection: PropTypes.array,
  patchPath: PropTypes.string,
  tabType: PropTypes.string,
  ghostLink: PropTypes.any,
  offset: PropTypes.object,
  focusedArea: PropTypes.string.isRequired,
  onDoubleClick: PropTypes.func.isRequired,
  connectDropTarget: PropTypes.func.isRequired,
  isDebugSession: PropTypes.bool,
  isPatchDraggedOver: PropTypes.bool,
  nodeValues: PropTypes.objectOf(PropTypes.string),
  /* eslint-enable react/no-unused-prop-types */
};

const mapStateToProps = R.applySpec({
  nodes: ProjectSelectors.getRenderableNodes,
  links: ProjectSelectors.getRenderableLinks,
  comments: ProjectSelectors.getRenderableComments,
  selection: EditorSelectors.getSelection,
  linkingPin: EditorSelectors.getLinkingPin,
  ghostLink: ProjectSelectors.getLinkGhost,
  offset: EditorSelectors.getCurrentPatchOffset,
  focusedArea: EditorSelectors.getFocusedArea,
  draggedPreviewSize: EditorSelectors.getDraggedPreviewSize,
  isDebugSession: DebugSelectors.isDebugSession,
  nodeValues: DebugSelectors.getWatchNodeValuesForCurrentPatch,
});

const mapDispatchToProps = dispatch => ({
  actions: bindActionCreators({
    addNode: ProjectActions.addNode,
    editComment: ProjectActions.editComment,
    moveSelection: EditorActions.moveSelection,
    resizeComment: ProjectActions.resizeComment,
    deselectAll: EditorActions.deselectAll,
    deleteSelection: EditorActions.deleteSelection,
    selectLink: EditorActions.selectLink,
    selectNode: EditorActions.selectNode,
    selectComment: EditorActions.selectComment,
    selectEntity: EditorActions.selectEntity,
    deselectEntity: EditorActions.deselectEntity,
    setSelection: EditorActions.setEditorSelection,
    combineSelection: EditorActions.combineEditorSelection,
    addEntityToSelection: EditorActions.addEntityToSelection,
    doPinSelection: EditorActions.doPinSelection,
    linkPin: EditorActions.linkPin,
    setOffset: EditorActions.setCurrentPatchOffset,
    switchPatch: EditorActions.switchPatch,
    drillDown: DebuggerActions.drillDown,
    openImplementationEditor: EditorActions.openImplementationEditor,
    patchWorkareaResized: EditorActions.patchWorkareaResized,
    changeArityLevel: ProjectActions.changeArityLevel,
  }, dispatch),
});

export default R.compose(
  connect(mapStateToProps, mapDispatchToProps, undefined, { withRef: true }),
  dropTarget
)(Patch);
