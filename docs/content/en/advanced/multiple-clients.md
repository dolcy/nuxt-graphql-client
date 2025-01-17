---
title: Multiple Clients
description: 'Configure your app to interact with multiple GraphQL APIs'
category: Advanced
position: 6
---
`nuxt-graphql-client` supports seamlessly  interacting with either a single or multiple GraphQL APIs.

## Default Client

If a single client is configured, it will be used by default.

In [Multiple Client Mode](#multiple-client-mode), the default client is inferred by either:
- The first configured client.
- Setting `default: true` on a client.
- Explicitly setting the client name to `default` in the Nuxt Configuration.

<alert>

Only one client can be set as [default](/advanced/multiple-clients#default-client).

</alert>

## Multiple Client Mode

When you have configured more than one client, The behavior of the module slightly changes and the pertinent client must be specified when using `nuxt-graphql-client`[Composables](/getting-started/composables) and when composing GraphQL Operations for the clients that aren't flagged as [default](#default-client).

### Configure multiple clients

Multiple clients can be configured by adding the `clients` key to the `graphql-client` property in public runtimeConfig.

The client names are inferred from the keys provided in the `clients` object.

[Available client options](/getting-started/configuration#clients)

```ts
import { defineNuxtConfig } from 'nuxt'

export default defineNuxtConfig({
  modules: ['nuxt-graphql-client'],

  runtimeConfig: {
    public: {
      'graphql-client': {
        clients: {
          default: 'https://api.spacex.land/graphql', // process.env.GQL_HOST
          github: {
            host: 'https://api.github.com/graphql', // process.env.GQL_GITHUB_HOST
            token: 'your_access_token', // process.env.GQL_GITHUB_TOKEN & process.env.GQL_GITHUB_TOKEN_NAME
          },
          countries: {
            host: 'https://countries.trevorblades.com/graphql', // process.env.GQL_COUNTRIES_HOST
            token: {
              name: 'X-Custom-Auth', // process.env.GQL_COUNTRIES_TOKEN_NAME
              value: 'your_access_token' // process.env.GQL_COUNTRIES_TOKEN
            }
          }
        }
      }
    }
  }
})
```

### Writing GraphQL Operations

When using multiple clients, you must specify the client that your GraphQL Operation is associated with.

There are two methods of associating a client:

1. Prefix the GraphQL Operation name with `<clientname>_`.

    ```graphql
    query github_viewer {
        viewer {
            login
        }
    }
    ```

    Doing so will automatically link the query above to the predefined spacex client **and drop the client prefix** from the autoImported function. This query will be executable in your app by simply calling `GqlViewer()`

    <alert>
    
    This method takes precedence and overrides all others.

    </alert>

3. Place the GraphQL Documents in a folder of the same name as the client.

    **ie:** Given `./nuxt_app/queries/spacex/launches.gql`
    
    All GraphQL operations within `launches.gql` (*that aren't prefixed with a client name*), will automatically be linked to the client matching the name of the GraphQL document's parent directory ie: `spacex`.

4. Lastly, GraphQL documents which don't match any of the aforementioned conventions will be linked to the [default client](#default-client).
    


