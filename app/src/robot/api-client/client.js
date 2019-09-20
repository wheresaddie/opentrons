// robot api client
// takes a dispatch (send) function and returns a receive handler
// TODO(mc, 2018-01-26): typecheck with flow
import { push } from 'connected-react-router'
import find from 'lodash/find'
import kebabCase from 'lodash/kebabCase'
import mapKeys from 'lodash/mapKeys'
import pick from 'lodash/pick'

import RpcClient from '../../rpc/client'
import { actions, actionTypes } from '../actions'
import * as constants from '../constants'
import * as selectors from '../selectors'

// bypass the robot entry point here to avoid shell module
import { getConnectableRobots } from '../../discovery/selectors'

const RUN_TIME_TICK_INTERVAL_MS = 1000
const NO_INTERVAL = -1
const RE_VOLUME = /.*?(\d+).*?/
const RE_TIPRACK = /tiprack/i

export default function client(dispatch) {
  let freshUpload = false
  let rpcClient
  let remote

  // TODO(mc, 2017-09-22): build some sort of timer middleware instead?
  let runTimerInterval = NO_INTERVAL

  // return an action handler
  return function receive(state = {}, action = {}) {
    const { type } = action

    switch (type) {
      case 'robot:CONNECT':
        return connect(
          state,
          action
        )
      case 'robot:DISCONNECT':
        return disconnect(state, action)
      case 'protocol:UPLOAD':
        return uploadProtocol(state, action)
      case 'robot:PICKUP_AND_HOME':
        return pickupAndHome(state, action)
      case 'robot:DROP_TIP_AND_HOME':
        return dropTipAndHome(state, action)
      case 'robot:CONFIRM_PROBED':
        return homePipette(state, action)
      case 'robot:CONFIRM_TIPRACK':
        return confirmTiprack(state, action)
      case actionTypes.MOVE_TO_FRONT:
        return moveToFront(state, action)
      case actionTypes.PROBE_TIP:
        return probeTip(state, action)
      case 'robot:MOVE_TO':
        return moveTo(state, action)
      case 'robot:JOG':
        return jog(state, action)
      case 'robot:UPDATE_OFFSET':
        return updateOffset(state, action)
      case actionTypes.RETURN_TIP:
        return returnTip(state, action)
      case actionTypes.RUN:
        return run(state, action)
      case actionTypes.PAUSE:
        return pause(state, action)
      case actionTypes.RESUME:
        return resume(state, action)
      case actionTypes.CANCEL:
        return cancel(state, action)
      case 'robot:REFRESH_SESSION':
        return refreshSession(state, action)

      // disconnect RPC prior to robot restart
      // TODO(mc, 2018-11-06): switch to api:RESPONSE when server.js switches
      case 'api:SERVER_SUCCESS': {
        const connectedName = selectors.getConnectedRobotName(state)
        const { path, robot } = action.payload
        if (path === 'restart' && connectedName === robot.name) disconnect()
        break
      }
    }
  }

  function connect(state, action) {
    if (rpcClient) disconnect()

    const name = action.payload.name
    const target = find(getConnectableRobots(state), { name })

    if (!target) {
      return dispatch(
        actions.connectResponse(new Error(`Robot "${name}" not found`))
      )
    }

    const { ip, port } = target

    RpcClient(`ws://${ip}:${port}`)
      .then(c => {
        rpcClient = c
        rpcClient
          .on('notification', handleRobotNotification)
          .on('close', handleUnexpectedDisconnect)
          .on('error', handleClientError)

        remote = rpcClient.remote
        const session = remote.session_manager.session

        // TODO(mc, 2017-12-07): handle this with fewer dispatches
        if (session) {
          handleApiSession(session)

          if (
            session.state === constants.RUNNING ||
            session.state === constants.PAUSED ||
            session.state === constants.FINISHED
          ) {
            dispatch(push('/run'))
          }
        }

        // only poll health if RPC is not monitoring itself with ping/pong
        dispatch(actions.connectResponse(null, !rpcClient.monitoring))
      })
      .catch(e => dispatch(actions.connectResponse(e)))
  }

  function disconnect() {
    if (rpcClient) {
      rpcClient.removeAllListeners('notification')
      rpcClient.removeAllListeners('error')
      rpcClient.removeAllListeners('close')
      rpcClient.close()
      rpcClient = null
    }

    clearRunTimerInterval()
    remote = null
    dispatch(actions.disconnectResponse())
  }

  function handleUnexpectedDisconnect() {
    dispatch(actions.unexpectedDisconnect())
  }

  function uploadProtocol(state, action) {
    const { name, isBinary } = state.protocol.file
    const { contents } = action.payload

    freshUpload = true
    remote.session_manager
      .create(name, contents, isBinary)
      .then(apiSession => {
        remote.session_manager.session = apiSession
        // state change will trigger a session notification, which will
        // dispatch a successful sessionResponse
      })
      .catch(error => {
        dispatch(actions.sessionResponse(error, null, freshUpload))
        freshUpload = false
      })
  }

  function moveToFront(state, action) {
    const {
      payload: { mount },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.moveToFrontResponse()), 1000)

    remote.calibration_manager
      .move_to_front(pipette)
      .then(() => dispatch(actions.moveToFrontResponse()))
      .catch(error => dispatch(actions.moveToFrontResponse(error)))
  }
  // Home pipette up
  function homePipette(state, action) {
    const { payload: mount } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }

    remote.calibration_manager.home(pipette)
  }

  // saves container offset and then attempts a tip pickup
  function pickupAndHome(state, action) {
    const {
      payload: { mount, slot },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }
    const labware = { _id: selectors.getLabwareBySlot(state)[slot]._id }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.pickupAndHomeResponse()), 1000)

    remote.calibration_manager
      .update_container_offset(labware, pipette)
      .then(() => remote.calibration_manager.pick_up_tip(pipette, labware))
      .then(() => dispatch(actions.pickupAndHomeResponse()))
      .catch(error => dispatch(actions.pickupAndHomeResponse(error)))
  }

  function dropTipAndHome(state, action) {
    const {
      payload: { mount, slot },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }
    const labware = { _id: selectors.getLabwareBySlot(state)[slot]._id }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.dropTipAndHomeResponse()), 1000)

    remote.calibration_manager
      .drop_tip(pipette, labware)
      .then(() => remote.calibration_manager.home(pipette))
      .then(() => remote.calibration_manager.move_to(pipette, labware))
      .then(() => dispatch(actions.dropTipAndHomeResponse()))
      .catch(error => dispatch(actions.dropTipAndHomeResponse(error)))
  }

  // drop the tip unless the tiprack is the last one to be confirmed
  function confirmTiprack(state, action) {
    const {
      payload: { mount, slot },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }
    const labware = { _id: selectors.getLabwareBySlot(state)[slot]._id }

    if (selectors.getUnconfirmedTipracks(state).length === 1) {
      return dispatch(actions.confirmTiprackResponse(null, true))
    }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.confirmTiprackResponse()), 1000)

    remote.calibration_manager
      .drop_tip(pipette, labware)
      .then(() => dispatch(actions.confirmTiprackResponse()))
      .catch(error => dispatch(actions.confirmTiprackResponse(error)))
  }

  function probeTip(state, action) {
    const {
      payload: { mount },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.probeTipResponse()), 1000)

    remote.calibration_manager
      .tip_probe(pipette)
      .then(() => dispatch(actions.probeTipResponse()))
      .catch(error => dispatch(actions.probeTipResponse(error)))
  }

  function returnTip(state, action) {
    const {
      payload: { mount },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }

    // FIXME(mc, 2017-10-05): DEBUG CODE
    // return setTimeout(() => dispatch(actions.return_tipResponse()), 1000)

    remote.calibration_manager
      .return_tip(pipette)
      .then(() => dispatch(actions.returnTipResponse()))
      .catch(error => dispatch(actions.returnTipResponse(error)))
  }

  function moveTo(state, action) {
    const {
      payload: { mount, slot },
    } = action
    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }
    const labware = { _id: selectors.getLabwareBySlot(state)[slot]._id }

    // FIXME - MORE DEBUG CODE
    // return setTimeout(() => {
    //   dispatch(actions.moveToResponse())
    //   dispatch(push(`/setup-deck/${slot}/confirm`))
    // }, 1000)

    remote.calibration_manager
      .move_to(pipette, labware)
      .then(() => {
        dispatch(actions.moveToResponse())
        dispatch(push(`/calibrate/labware/${slot}/confirm`))
      })
      .catch(error => dispatch(actions.moveToResponse(error)))
  }

  function jog(state, action) {
    const {
      payload: { mount, axis, direction, step },
    } = action
    const pipette = selectors.getPipettesByMount(state)[mount]
    const distance = step * direction

    // FIXME(mc, 2017-10-06): DEBUG CODE
    // return setTimeout(() => dispatch(actions.jogResponse()), 1000)

    remote.calibration_manager
      .jog(pipette, distance, axis)
      .then(() => dispatch(actions.jogResponse()))
      .catch(error => dispatch(actions.jogResponse(error)))
  }

  // saves container offset
  // TODO(mc, 2018-02-07): rename to confirmNonTiprack
  function updateOffset(state, action) {
    const {
      payload: { mount, slot },
    } = action
    const labwareObject = selectors.getLabwareBySlot(state)[slot]

    const pipette = { _id: selectors.getPipettesByMount(state)[mount]._id }
    const labware = { _id: labwareObject._id }

    // FIXME(mc, 2017-10-06): DEBUG CODE
    // return setTimeout(() => dispatch(actions.updateOffsetResponse()), 2000)

    remote.calibration_manager
      .update_container_offset(labware, pipette)
      .then(() => dispatch(actions.updateOffsetResponse()))
      .catch(error => dispatch(actions.updateOffsetResponse(error)))
  }

  function run(state, action) {
    setRunTimerInterval()
    remote.session_manager.session
      .run()
      .then(() => dispatch(actions.runResponse()))
      .catch(error => dispatch(actions.runResponse(error)))
      .then(() => clearRunTimerInterval())
  }

  function pause(state, action) {
    remote.session_manager.session
      .pause()
      .then(() => dispatch(actions.pauseResponse()))
      .catch(error => dispatch(actions.pauseResponse(error)))
  }

  function resume(state, action) {
    remote.session_manager.session
      .resume()
      .then(() => dispatch(actions.resumeResponse()))
      .catch(error => dispatch(actions.resumeResponse(error)))
  }

  function cancel(state, action) {
    // ensure session is unpaused before canceling to work around RPC API's
    // inablity to cancel a paused protocol
    remote.session_manager.session
      .resume()
      .then(() => remote.session_manager.session.stop())
      .then(() => dispatch(actions.cancelResponse()))
      .catch(error => dispatch(actions.cancelResponse(error)))
  }

  function refreshSession(state, action) {
    remote.session_manager.session
      .refresh()
      .catch(error => dispatch(actions.sessionResponse(error)))
  }

  function setRunTimerInterval() {
    if (runTimerInterval === NO_INTERVAL) {
      runTimerInterval = setInterval(
        () => dispatch(actions.tickRunTime()),
        RUN_TIME_TICK_INTERVAL_MS
      )
    }
  }

  function clearRunTimerInterval() {
    clearInterval(runTimerInterval)
    runTimerInterval = NO_INTERVAL
  }

  function handleApiSession(apiSession) {
    const update = { state: apiSession.state, startTime: apiSession.startTime }

    // ensure run timer is running or stopped
    if (update.state === constants.RUNNING) {
      setRunTimerInterval()
    } else {
      clearRunTimerInterval()
    }

    // if lastCommand key is present, we're dealing with a light update
    if ('lastCommand' in apiSession) {
      const lastCommand = apiSession.lastCommand && {
        id: apiSession.lastCommand.id,
        handledAt: apiSession.lastCommand.handledAt,
      }

      return dispatch(
        actions.sessionUpdate({ ...update, lastCommand }, Date.now())
      )
    }

    // else we're doing a heavy full session deserialization
    try {
      // TODO(mc, 2017-08-30): Use a reduce
      if (apiSession.commands) {
        update.protocolCommands = []
        update.protocolCommandsById = {}
        apiSession.commands.forEach(makeHandleCommand())
      }

      if (apiSession.instruments) {
        update.pipettesByMount = {}
        apiSession.instruments.forEach(addApiInstrumentToPipettes)
      }

      if (apiSession.containers) {
        update.labwareBySlot = {}
        apiSession.containers.forEach(addApiContainerToLabware)
      }

      if (apiSession.modules) {
        update.modulesBySlot = {}
        // TODO (ka 2018-7-17): MOCKED MODULES by slot here instead of
        // session.py uncomment below to test
        // update.modulesBySlot = {
        //   '1': {
        //     id: '4374062089',
        //     name: 'tempdeck',
        //     slot: '1'
        //   }
        // }
        apiSession.modules.forEach(addApiModuleToModules)
      }

      if (apiSession.protocol_text) {
        update.protocolText = apiSession.protocol_text
      }

      if (apiSession.name) update.name = apiSession.name

      // strip RPC cruft and map to JSON protocol data shape
      // pick + mapKeys guard against bad input shape and/or type
      if (apiSession.metadata) {
        update.metadata = pick(
          // TODO(mc, 2018-12-10): switch to camelCase when JSON protocols do
          mapKeys(apiSession.metadata, (value, key) => kebabCase(key)),
          // TODO(mc, 2018-12-10): codify "source" in JSON protocol schema
          ['protocol-name', 'description', 'author', 'source']
        )
      }

      update.apiLevel = apiSession.api_level || 1

      dispatch(actions.sessionResponse(null, update, freshUpload))
    } catch (error) {
      dispatch(actions.sessionResponse(error, null, freshUpload))
    }

    freshUpload = false

    function makeHandleCommand(depth = 0) {
      return function handleCommand(command) {
        const { id, description } = command
        const logEntry = apiSession.command_log[id]
        const children = Array.from(command.children)
        let handledAt = null

        if (logEntry != null) handledAt = logEntry
        if (depth === 0) update.protocolCommands.push(id)

        children.forEach(makeHandleCommand(depth + 1))

        update.protocolCommandsById[id] = {
          id,
          description,
          handledAt,
          children: children.map(c => c.id),
        }
      }
    }

    function addApiInstrumentToPipettes(apiInstrument) {
      const { _id, mount, name, channels } = apiInstrument
      // TODO(mc, 2018-01-17): pull this somehow from tiprack the instrument
      //  interacts with
      const volume = Number(name.match(RE_VOLUME)[1])

      update.pipettesByMount[mount] = { _id, mount, name, channels, volume }
    }

    function addApiContainerToLabware(apiContainer) {
      const {
        _id,
        name,
        type,
        slot,
        position,
        is_legacy: isLegacy,
      } = apiContainer
      const isTiprack = RE_TIPRACK.test(type)
      const labware = { _id, name, slot, position, type, isTiprack, isLegacy }

      if (isTiprack && apiContainer.instruments.length > 0) {
        // if tiprack used by both pipettes, prefer single for calibration
        const calibrator =
          find(apiContainer.instruments, { channels: 1 }) ||
          apiContainer.instruments[0]

        if (calibrator) labware.calibratorMount = calibrator.mount
      }

      update.labwareBySlot[slot] = labware
    }

    function addApiModuleToModules(apiModule) {
      update.modulesBySlot[apiModule.slot] = apiModule
    }
  }

  function handleRobotNotification(message) {
    const { topic, payload } = message

    console.log(`"${topic}" message:`, payload)

    switch (topic) {
      case 'session':
        return handleApiSession(payload)
    }

    console.warn(`"${topic}" message was unhandled`)
  }

  function handleClientError(error) {
    console.error(error)
  }
}
