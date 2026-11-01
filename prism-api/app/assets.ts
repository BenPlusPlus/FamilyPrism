import { createAssetServer } from 'remix/assets'

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  allowFiles: ['app/assets/**', 'app/ui/prompt-button.tsx', 'app/routes.ts'],
  allowPackages: ['remix'],
  denyFiles: ['app/**/*.server.*'],
  sourceMaps: process.env.NODE_ENV === 'development' ? 'external' : undefined,
  scripts: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
  },
})

export const scriptEntry = await assets.getScriptEntry('app/assets/entry.ts')
