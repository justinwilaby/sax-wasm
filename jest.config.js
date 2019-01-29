module.exports = {
  "transform": {
    "^.+\\.(ts)$": "ts-jest"
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
