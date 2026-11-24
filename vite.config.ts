import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: [preact(), ...(single ? [viteSingleFile()] : [])],
  build: { target: 'es2022', outDir: single ? 'dist-single' : 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
