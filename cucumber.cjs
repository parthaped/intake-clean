/** @type {import("@cucumber/cucumber").IConfiguration} */
module.exports = {
  default: {
    // Step files are TypeScript; tsx (registered via --import tsx in the
    // npm script) handles their loading transparently.
    import: ["tests/cucumber/steps/**/*.ts"],
    paths: ["tests/cucumber/features/**/*.feature"],
    format: ["progress", "summary"],
    publishQuiet: true,
  },
};
