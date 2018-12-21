// @flow
import * as React from 'react'
import {connect} from 'react-redux'
import {selectors} from '../labware-ingred/reducers'
import * as wellSelectionSelectors from '../top-selectors/well-contents'
import {removeWellsContents} from '../labware-ingred/actions'
import type {Dispatch} from 'redux'
import type {BaseState} from '../types'

import IngredientsList from '../components/IngredientsList'

type Props = React.ElementProps<typeof IngredientsList>

type DP = {
  removeWellsContents: $ElementType<Props, 'removeWellsContents'>,
}

type SP = $Diff<Props, DP> & {_labwareId: ?string}

// TODO: BC: 2018-12-21 figure out how to get commonIngredId now that it's not it redux
// should we put a shim in the ui branch, just so this one list item can have an active state
// or do we not worry about this as we're probably revisiting the visual hierarchy of
// the liquidPlacementModal and Form soon?
function mapStateToProps (state: BaseState): SP {
  const container = selectors.getSelectedLabware(state)
  const _labwareId = container && container.id

  return {
    liquidGroupsById: selectors.getLiquidGroupsById(state),
    labwareWellContents: (container && selectors.getLiquidsByLabwareId(state)[container.id]) || {},
    selectedIngredientGroupId: wellSelectionSelectors.getSelectedWellsCommonIngredId(state),
    selected: false,
    _labwareId,
  }
}

function mergeProps (stateProps: SP, dispatchProps: {dispatch: Dispatch<*>}): Props {
  const {dispatch} = dispatchProps
  const {_labwareId, ...passThruProps} = stateProps
  return {
    ...passThruProps,
    removeWellsContents: (args) => dispatch(removeWellsContents({...args, labwareId: _labwareId})),
  }
}

export default connect(mapStateToProps, null, mergeProps)(IngredientsList)
