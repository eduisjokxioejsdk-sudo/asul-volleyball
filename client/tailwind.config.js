/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/features/fast-direct/**/*.{js,jsx}', './src/pages/FastDirect*.jsx'],
  corePlugins: {
    // Ne jamais modifier le reset global de Pancake : les utilitaires Fast
    // Direct sont volontairement limités au conteneur de ce mode.
    preflight: false,
  },
  important: '.fast-direct-root',
  theme: {
    extend: {},
  },
  plugins: [],
};
