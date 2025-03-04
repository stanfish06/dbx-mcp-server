/** @type {import('@jest/types').Config.InitialOptions} */
export default {
    testEnvironment: 'node',
    transform: {
        '^.+\\.(t|j)sx?$': 'babel-jest'
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@modelcontextprotocol|zod)/)'
    ],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: [
        '<rootDir>/tests/**/*.test.ts'
    ],
    globals: {
        'ts-jest': {
            useESM: true
        }
    }
};
