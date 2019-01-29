module.exports = {
  "transform": {
    "^.+\\.(ts)$": "<rootDir>/node_modules/ts-jest"
  },
  "testURL": "http://localhost",
  "testMatch": [
    "<rootDir>/src/js/**/?(*.)(spec|test).(ts)"
  ],
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node"
  ]
};
