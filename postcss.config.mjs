const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    [`${process.cwd()}/scripts/postcss-strip-scoped-tailwind-properties.cjs`]: {},
  },
};

export default config;
