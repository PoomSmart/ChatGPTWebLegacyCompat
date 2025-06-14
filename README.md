# ChatGPTWebLegacyCompat

Makes the ChatGPT web app compatible with legacy browsers (mostly iOS 15.0 - 15.4 for now).

## The Big Ideas

1. Copy all stylesheets from the ChatGPT web app.
2. Manually remove incompatible syntaxes such as:
    - `::backdrop`
    - (Not yet) `@container`
    - `@layer`
3. Manually change all dynamic viewport units from `{d,s,l}v{w,h}` to `v{w,h}`
4. Manually format the stylesheets
5. Use a script to
    1. Strip all rules with the weird `\ !`
    2. Minify the stylesheets
    3. Transform the stylesheets to be in Objective-C NSString format
6. Inject the stylesheets into WKWebView when the website domain is ChatGPT

## Unsurprisingly

This project was built with significant help from ChatGPT.
