# ChatGPTWebLegacyCompat

Makes the ChatGPT web app compatible with legacy browsers (mostly iOS 15, for now).

## The Big Ideas

1. Download `root.css` from ChatGPT web app
2. Run `node extract-layers.js root.css styles/root-base.css`
3. Run `make assets`
4. Run `make`

## Unsurprisingly

This project was built with significant help from ChatGPT.
