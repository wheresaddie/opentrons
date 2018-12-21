// @flow
import {createSelector} from 'reselect'

import mapValues from 'lodash/mapValues'
import min from 'lodash/min'
import pick from 'lodash/pick'
import reduce from 'lodash/reduce'
import omitBy from 'lodash/omitBy'

import * as StepGeneration from '../../step-generation'
import {selectors as fileDataSelectors} from '../../file-data'
import {selectors as labwareIngredSelectors} from '../../labware-ingred/reducers'
import wellSelectionSelectors from '../../well-selection/selectors'
import {getAllWellsForLabware, getMaxVolumes} from '../../constants'

import type {Selector} from '../../types'
import type {
  WellContents,
  WellContentsByLabware,
  ContentsByWell,
} from '../../labware-ingred/types'

// TODO Ian 2018-04-19: factor out all these selectors to their own files,
// and make this index.js just imports and exports.
import getWellContentsAllLabware from './getWellContentsAllLabware'
export {getWellContentsAllLabware}
export type {WellContentsByLabware}

function _wellContentsForWell (
  liquidVolState: StepGeneration.LocationLiquidState,
  well: string
): WellContents {
  // TODO IMMEDIATELY Ian 2018-03-23 why is liquidVolState missing sometimes (eg first call with trashId)? Thus the liquidVolState || {}
  const ingredGroupIdsWithContent = Object.keys(liquidVolState || {}).filter(groupId => (
    liquidVolState[groupId] && liquidVolState[groupId].volume > 0
  ))

  return {
    highlighted: false,
    selected: false,
    error: false,
    maxVolume: Infinity, // TODO Ian 2018-03-23 refactor so all these fields aren't needed
    wellName: well,
    groupIds: ingredGroupIdsWithContent, // TODO: BC 2018-09-21 remove in favor of volumeByGroupId
    ingreds: omitBy(liquidVolState, (ingredData) => !ingredData || ingredData.volume <= 0),
  }
}

export function _wellContentsForLabware (
  labwareLiquids: StepGeneration.SingleLabwareLiquidState,
  labwareId: string,
  labwareType: string
): ContentsByWell {
  const allWellsForContainer = getAllWellsForLabware(labwareType)

  return reduce(
    allWellsForContainer,
    (wellAcc, well: string): {[well: string]: WellContents} => {
      const wellHasContents = labwareLiquids && labwareLiquids[well]
      return {
        ...wellAcc,
        [well]: wellHasContents
          ? _wellContentsForWell(labwareLiquids[well], well)
          : {},
      }
    },
    {}
  )
}

export const getAllWellContentsForSteps: Selector<Array<WellContentsByLabware>> = createSelector(
  fileDataSelectors.getInitialRobotState,
  fileDataSelectors.getRobotStateTimeline,
  (initialRobotState, robotStateTimeline) => {
    const timeline = [{robotState: initialRobotState}, ...robotStateTimeline.timeline]

    return timeline.map((timelineStep, timelineIndex) => {
      const liquidState = timelineStep.robotState.liquidState.labware
      return mapValues(
        liquidState,
        (labwareLiquids: StepGeneration.SingleLabwareLiquidState, labwareId: string) => {
          const robotState = timeline[timelineIndex].robotState
          const labwareType = robotState.labware[labwareId].type

          return _wellContentsForLabware(
            labwareLiquids,
            labwareId,
            labwareType
          )
        }
      )
    })
  }
)

export const getLastValidWellContents: Selector<WellContentsByLabware> = createSelector(
  fileDataSelectors.lastValidRobotState,
  (robotState) => {
    return mapValues(
      robotState.labware,
      (labwareLiquids: StepGeneration.SingleLabwareLiquidState, labwareId: string) => {
        return _wellContentsForLabware(
          robotState.liquidState.labware[labwareId],
          labwareId,
          robotState.labware[labwareId].type
        )
      }
    )
  }
)

export const getSelectedWellsMaxVolume: Selector<number> = createSelector(
  wellSelectionSelectors.getSelectedWells,
  labwareIngredSelectors.getSelectedLabware,
  (selectedWells, selectedContainer) => {
    const selectedWellNames = Object.keys(selectedWells)
    const selectedContainerType = selectedContainer && selectedContainer.type
    if (!selectedContainerType) {
      console.warn('No container type selected, cannot get max volume')
      return Infinity
    }
    const maxVolumesByWell = getMaxVolumes(selectedContainerType)
    const maxVolumesList = (selectedWellNames.length > 0)
      // when wells are selected, only look at vols of selected wells
      ? Object.values(pick(maxVolumesByWell, selectedWellNames))
      // when no wells selected (eg editing ingred group), look at all volumes.
      // TODO LATER: look at filled wells, not all wells.
      : Object.values(maxVolumesByWell)
    return min(maxVolumesList.map(n => parseInt(n)))
  }
)
