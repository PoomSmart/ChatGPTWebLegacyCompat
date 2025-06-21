# ChatGPTWebLegacyCompat

Makes the ChatGPT web app compatible with legacy browsers (mostly iOS 15, for now).

## The Big Ideas

1. Copy all stylesheets from the ChatGPT web app
2. Manually only the relevant selectors
3. Manually remove incompatible syntaxes such as:
    - `::backdrop`
    - `@container`
    - `@layer`
4. Manually change all dynamic viewport units from `{d,s,l}v{w,h}` to `v{w,h}`
5. Manually format the stylesheets
6. Use a script to
    1. Minify the stylesheets
    2. Transform the stylesheets to be in Objective-C NSString format
7. Inject the stylesheets into WKWebView when the website domain is ChatGPT

## Unsurprisingly

This project was built with significant help from ChatGPT.
