import React from 'react';
import PropTypes from 'prop-types';
import { noop } from 'xod-func-tools';

import { SLOT_SIZE, NODE_HEIGHT, GRID_SIZE } from '../../nodeLayout';

// Add 0.5 to compensate blurring of pattern
const COMPENSATE_BLUR = 0.5;

const NodeSlotPattern = ({ offset }) => (
  <pattern
    id="patch_bg_pattern"
    x={Math.round(offset.x) - COMPENSATE_BLUR}
    y={Math.round(offset.y) - COMPENSATE_BLUR}
    width={GRID_SIZE}
    height={GRID_SIZE}
    patternUnits="userSpaceOnUse"
  >
    <g stroke="none" fill="none">
      <line x1={COMPENSATE_BLUR} y1={1} x2={COMPENSATE_BLUR} y2={GRID_SIZE} />
      <line
        x1={0}
        y1={COMPENSATE_BLUR}
        x2={GRID_SIZE}
        y2={COMPENSATE_BLUR}
      />
      <line
        x1={0}
        y1={GRID_SIZE + COMPENSATE_BLUR}
        x2={GRID_SIZE}
        y2={GRID_SIZE + COMPENSATE_BLUR}
      />
    </g>
  </pattern>
);

NodeSlotPattern.propTypes = {
  offset: PropTypes.object.isRequired,
};

const BackgroundLayer = ({ onClick, onDoubleClick, onMouseDown, offset }) => (
  <g className="BackgroundLayer">
    <NodeSlotPattern offset={offset} />
    <rect
      className="BackgroundRect"
      key="bg"
      x="0"
      y="0"
      width="100%"
      height="100%"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
    />
  </g>
);

BackgroundLayer.defaultProps = {
  onClick: noop,
  onDoubleClick: noop,
  onMouseDown: noop,
};

BackgroundLayer.propTypes = {
  onClick: PropTypes.func,
  onDoubleClick: PropTypes.func,
  onMouseDown: PropTypes.func,
  offset: PropTypes.object.isRequired,
};

export default BackgroundLayer;
