/**
 * Metro config for a pnpm workspace.
 *
 * pnpm uses an isolated (symlinked) node_modules rather than a hoisted tree, which
 * Metro does not discover on its own. The three settings below are what make
 * `@odyssey/ui`, `@odyssey/api-client` etc. resolvable from inside the app:
 *
 *   watchFolders             - lets Metro see (and hot-reload) files outside apps/dashboard
 *   nodeModulesPaths         - the two real locations packages can live in
 *   disableHierarchicalLookup - stop Metro walking up the tree and finding duplicate
 *                               copies of react / react-native, which breaks hooks
 *
 * Workspace packages intentionally ship TypeScript source (their `exports` point at
 * src/*.ts), so Metro transpiles them with babel-preset-expo like first-party code.
 * That keeps the design system editable with instant refresh and no build step.
 */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

config.resolver.disableHierarchicalLookup = true

module.exports = config
