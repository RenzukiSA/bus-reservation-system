const esbuild = require('esbuild');
const path = require('path');

// Este script empaqueta nuestro código de validación compartido 
// para que pueda ser usado en el navegador.

esbuild.build({
  entryPoints: [path.resolve(__dirname, '../shared/validation.ts')],
  bundle: true,
  outfile: path.resolve(__dirname, '../public/js/shared-validation.js'),
  format: 'iife', // Formato para navegador
  globalName: 'schemas', // Expone todo como `window.schemas`
  platform: 'browser',
}).catch(() => process.exit(1));

console.log('✅ Shared validation bundle created successfully!');
