import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, PluginOption } from 'vite'
import fsRouter from './vite-fs-router-plugin/index.js'

// https://vitejs.dev/config/
export default defineConfig((options) => {
  const isAnalyzeMode = options.mode === 'analyze'
  const plugins: PluginOption[] = [react(), tailwindcss(), fsRouter()]
  if (isAnalyzeMode) {
    plugins.push(
      visualizer({
        filename: './dist/stats.html',
        open: true,
        sourcemap: true,
      }),
    )
  }
  return {
    plugins,
    build: {
      sourcemap: isAnalyzeMode ? 'inline' : false,
      minify: !isAnalyzeMode,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
    },
  }
})
