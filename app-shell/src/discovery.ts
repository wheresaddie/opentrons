// app shell discovery module
import { app } from 'electron'
import Store from 'electron-store'
import throttle from 'lodash/throttle'

import createDiscoveryClient, {
  DiscoveryClient,
  Service,
  SERVICE_EVENT,
  SERVICE_REMOVED_EVENT,
} from '@opentrons/discovery-client'

import { getConfig, getOverrides, handleConfigChange } from './config'
import createLogger from './log'

import { Action, Dispatch } from './types'

interface DiscoveryStore {
  services: Service[]
}

const log = createLogger(__filename)

// TODO(mc, 2018-08-09): values picked arbitrarily and should be researched
const FAST_POLL_INTERVAL_MS = 3000
const SLOW_POLL_INTERVAL_MS = 15000
const UPDATE_THROTTLE_MS = 500

let config
let store: Store<DiscoveryStore>
let client: DiscoveryClient

export function registerDiscovery(dispatch: Dispatch): Dispatch {
  const onServiceUpdate = throttle(handleServices, UPDATE_THROTTLE_MS)

  config = getConfig('discovery')
  store = new Store<DiscoveryStore>({
    name: 'discovery',
    defaults: { services: [] },
  })

  client = createDiscoveryClient({
    pollInterval: SLOW_POLL_INTERVAL_MS,
    logger: log,
    candidates: ['[fd00:0:cafe:fefe::1]'].concat(config.candidates),
    services: store.get('services'),
  })

  client
    .on(SERVICE_EVENT, onServiceUpdate)
    .on(SERVICE_REMOVED_EVENT, onServiceUpdate)
    .on('error', error => log.error('discovery error', { error }))
    .start()

  handleConfigChange('discovery.candidates', value =>
    client.setCandidates(['[fd00:0:cafe:fefe::1]'].concat(value))
  )

  app.once('will-quit', () => client.stop())

  return function handleIncomingAction(action: Action) {
    log.debug('handling action in discovery', { action })

    switch (action.type) {
      case 'discovery:START':
        handleServices()
        return client.setPollInterval(FAST_POLL_INTERVAL_MS).start()

      case 'discovery:FINISH':
        return client.setPollInterval(SLOW_POLL_INTERVAL_MS)

      case 'discovery:REMOVE':
        return client.remove(action.payload.robotName)
    }
  }

  function handleServices(): void {
    store.set('services', filterServicesToPersist(client.services))

    dispatch({
      type: 'discovery:UPDATE_LIST',
      payload: { robots: client.services },
    })
  }
}

export function getRobots(): Service[] {
  if (!client) return []

  return client.services
}

function filterServicesToPersist(services: Array<Service>): Service[] {
  const candidateOverrides = getOverrides('discovery.candidates')
  if (!candidateOverrides) return services

  const blacklist = [].concat(candidateOverrides)
  return services.filter(s => blacklist.every(ip => ip !== s.ip))
}
