// Stub for the Next.js `server-only` package so that pure-logic source
// files which include `import "server-only"` can be loaded inside a plain
// Node-based test runner (Jasmine + Cucumber). The real package throws on
// import outside of a Server Component context; in tests we don't care.
module.exports = {};
