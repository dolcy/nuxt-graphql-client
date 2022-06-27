import { defu } from 'defu'
import { GraphQLClient, ClientError } from 'graphql-request'
import type { Ref } from 'vue'
import type { GqlClient, GqlConfig } from '../../module'
import { deepmerge } from '../utils'
import type { GqlClients } from '#build/gql'

import { getSdk as gqlSdk } from '#build/gql-sdk'
import { ref, useNuxtApp, useRuntimeConfig, useRequestHeaders } from '#imports'

class GqlError extends ClientError {
  message: string
  gqlClient?: GqlClients
  operationName?: string
  operationType?: string

  constructor (
    response: ClientError['response'],
    request: ClientError['request'],
    message?: string,
    gqlClient?: GqlClients,
    operationName?: string,
    operationType?: string
  ) {
    super(response, request)

    Object.setPrototypeOf(this, GqlError.prototype)

    this.message = message
    this.gqlClient = gqlClient
    this.operationName = operationName
    this.operationType = operationType
  }
}

interface GqlState {
  clients?: Record<string, GraphQLClient>

  options?: Record<string, RequestInit>

  onError?: <T>(error: GqlError | GqlError[] /*, retry?: Parameters<SdkFunctionWrapper>[0] */) => Promise<T> | any

  /**
   * Send cookies from the browser to the GraphQL server in SSR mode.
   *
   * @default true
   * */
  proxyCookies?: boolean
}

const DEFAULT_STATE: GqlState = { proxyCookies: true }

/**
 *
 * @param {object} state
 * @param {boolean} reset
 *
 * */
// The decision was made to avert using `GraphQLClient's` `setHeader(s)` helper in favor of reactivity and more granular control.
const useGqlState = (state?: GqlState, reset?: boolean): Ref<GqlState> => {
  const nuxtApp = useNuxtApp()

  if (!nuxtApp._gqlState) {
    nuxtApp._gqlState = ref<GqlState>(Object.assign({}, DEFAULT_STATE))
  }

  if (state) {
    if (state.options) {
      const optionKeys = Object.keys(state.options || {})

      for (const k of optionKeys) {
        if (!nuxtApp._gqlState.value.clients?.[k]) { delete state.options[k] }
      }
    }

    if (reset === undefined) { reset = !Object.keys(state).length }

    if (reset) {
      nuxtApp._gqlState.value = Object.assign(DEFAULT_STATE, {
        clients: nuxtApp._gqlState.value.clients
      })
    } else { nuxtApp._gqlState.value = deepmerge(nuxtApp._gqlState.value, state) }

    const clients = (nuxtApp._gqlState.value as GqlState).clients

    if (clients) {
      for (const [k, v] of Object.entries(clients)) {
        if (reset) {
          // @ts-ignore
          v.options = {}

          continue
        }

        if (!state?.options?.[k]) { continue }

        // @ts-ignore
        v.options = nuxtApp._gqlState.value.options[k]
      }
    }
  }

  return nuxtApp._gqlState as Ref<GqlState>
}

const useGqlErrorState = () => useState<GqlError | GqlError[]>('_gqlErrors', () => null)

const initClients = () => {
  const state = useGqlState()

  const config = useRuntimeConfig()
  const { clients } = deepmerge({}, defu(config?.['graphql-client'], config?.public?.['graphql-client'])) as GqlConfig

  state.value.clients = state.value?.clients || {}
  state.value.options = state.value?.options || {}

  for (const [name, v] of Object.entries(clients)) {
    if (state.value?.clients[name]) { continue }

    if (!state.value?.options[name]) { state.value.options[name] = {} }

    const host = (process.client && v?.clientHost) || v.host

    const c = new GraphQLClient(host, state.value.options[name])
    state.value.clients[name] = c

    if (v?.token?.value) { useGqlToken(v.token.value, { client: name as GqlClients }) }
  }
}

const getClient = (client?: GqlClients): GqlClients => {
  const state = useGqlState()

  if (client && state.value?.clients?.[client]) { return client }

  const { clients } = useRuntimeConfig()?.public?.['graphql-client'] as GqlConfig

  if (!state.value.clients || !state.value.options) { initClients() }

  if (!client && Object.keys(clients)?.length) {
    const defaultClient = Object.entries(clients).find(
      ([k, v]) => k === 'default' || v?.default
    )

    if (defaultClient) { client = defaultClient[0] as GqlClients } else { client = Object.keys(clients)[0] as GqlClients }
  }

  return client
}

const useGqlClient = (client?: GqlClients): {client: GqlClients, instance: GraphQLClient} => {
  const state = useGqlState()

  client = getClient(client)

  return { client, instance: state.value.clients[client] }
}

/**
 * `useGqlHeaders` allows you to set headers for all subsequent requests.
 *
 * @param {object} headers
 * @param {string} client
 *
 * @example
 * - Set headers for default client
 * ```ts
 * useGqlHeaders({ 'X-Custom-Header': 'Custom Value' })
 * ```
 *
 * - Set headers for a specific client (multi-client mode)
 * ```ts
 * useGqlHeaders({
 *   'X-Custom-Header': 'Custom Value'
 * }, 'my-client')
 * ```
 * */
export const useGqlHeaders = (headers: HeadersInit, client?: GqlClients) => {
  client = getClient(client)

  useGqlState({ options: { [client]: { headers } } })
}

interface GqlTokenConfig {
  /**
   * The name of the Authentication token header.
   *
   * @default 'Authorization'
   * */
  name: string

  /**
   * The HTTP Authentication scheme.
   *
   * @default "Bearer"
   * */
  type?: string
}

const DEFAULT_AUTH: GqlTokenConfig = { type: 'Bearer', name: 'Authorization' }

type GqlTokenOptions = {
  /**
   * Configure the auth token
   *
   * @default
   * `{ type: 'Bearer', name: 'authorization' }`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
   * */
  config?: GqlTokenConfig

  /**
   * The name of your GraphQL clients.
   * @note defined in `nuxt.config`
   * */
  client?: GqlClients
}

/**
 * `useGqlToken` adds an Authorization header to every request.
 *
 * @param {string} token
 * @param {object} opts
 * */
export const useGqlToken = (token: string, opts?: GqlTokenOptions) => {
  let { client, config } = opts || {}

  client = getClient(client)

  const clientConfig: GqlClient<object> = useRuntimeConfig()?.public?.['graphql-client']?.clients?.[client]

  config = {
    ...DEFAULT_AUTH,
    ...(clientConfig?.token?.name && { name: clientConfig.token.name }),
    ...(clientConfig?.token?.type !== undefined && { type: clientConfig.token.type }),
    ...config
  }

  const state = useGqlState()

  if (token) {
    useGqlState({
      options: {
        [client]: {
          headers: { [config.name]: `${config.type} ${token}`.trim() }
        }
      }
    })
  } else if (state.value?.options?.[client]?.headers?.[config.name]) {
    delete state.value.options[client].headers[config.name]
  }
}

interface GqlCors {
  mode?: RequestMode
  credentials: RequestCredentials

  /**
   * The name of your GraphQL client.
   * @note defined in `nuxt.config`
   * */
  client?: GqlClients
}

/**
 * `useGqlCors` adds CORS headers to every request.
 *
 * @param {object} opts
 * */
export const useGqlCors = ({ mode, credentials, client }: GqlCors) => {
  client = getClient(client)

  const corsOptions = {
    ...(mode && { mode }),
    ...(credentials && { credentials })
  }

  useGqlState({ options: { [client]: corsOptions } })
}

/**
 * @param {string} client
 *
 * @note `client` should match the name of the GraphQL client used for the operation being executed.
 * */
export const useGql = (client?: GqlClients): ReturnType<typeof gqlSdk> => {
  const state = useGqlState()
  const errState = useGqlErrorState()

  const { client: gqlClient, instance } = useGqlClient(client)

  if (process.server && state.value?.proxyCookies) {
    const { cookie } = useRequestHeaders(['cookie'])

    if (cookie) { instance.setHeader('cookie', cookie) }
  }

  const $gql: ReturnType<typeof gqlSdk> = gqlSdk(instance, async (action, operationName, operationType): Promise<any> => {
    try {
      return await action()
    } catch (err) {
      const gqlError = {
        ...err,
        response: JSON.parse(JSON.stringify(err?.response)),
        gqlClient,
        operationName,
        operationType
      }

      errState.value = Array.isArray(errState.value) ? [...errState.value, gqlError] : [gqlError]

      // only trigger `onError` on client side (ie: `onError` is never set on server).
      // hence allowing usage of nuxt's composables in `useGqlError`
      // process.client can be removed.
      if (process.client && state.value.onError) {
        state.value.onError(gqlError)
      }

      // return gqlError
      throw gqlError
    }
  })

  return { ...$gql }
}

/**
 * `useGqlError` captures errors from GraphQL requests.
 *
 * @param {GqlState['onError']} onError Gql Error Handler
 *
 * @example <caption>Log error to console.</caption>
 * ```ts
 * useGqlError((err) => {
 *    console.error(err)
 * })
 * ```
 * */
export const useGqlError = (onError: GqlState['onError']) => {
  if (process.server) { return }

  useGqlState().value.onError = onError

  const errState = useGqlErrorState()

  if (!errState.value) { return }

  onError(errState.value)
}
