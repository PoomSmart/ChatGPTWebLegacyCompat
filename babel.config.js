module.exports = {
    plugins: [
        ['@babel/plugin-transform-class-properties', { "loose": true }],
        '@babel/plugin-transform-nullish-coalescing-operator',
        ['@babel/plugin-transform-private-methods', { "loose": true }],
        ['@babel/plugin-transform-private-property-in-object', { "loose": true }],
        '@babel/plugin-transform-template-literals',
    ]
};
