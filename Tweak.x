#define CHECK_TARGET
#import <PSHeader/PS.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <WebKit/WKPreferences.h>
#import <WebKit/WKWebView.h>
#import <WebKit/WKWebViewConfiguration.h>
#import <version.h>
#import "ChatGPTWebLegacyCompatCSS.h"
#import "Polyfills1.h"
#import "Polyfills2.h"

static NSString *injectStyles(NSString *id, NSString *styles) {
    // Escape the CSS for JavaScript string literal (double quotes)
    NSString *escapedStyles = [styles stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escapedStyles = [escapedStyles stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
    escapedStyles = [escapedStyles stringByReplacingOccurrencesOfString:@"\n" withString:@"\\n"];
    escapedStyles = [escapedStyles stringByReplacingOccurrencesOfString:@"\r" withString:@"\\r"];

    return [NSString stringWithFormat:@"(function(){if(document.getElementById('%@')===null){const styleSheet=document.createElement('style');styleSheet.type='text/css';styleSheet.textContent=\"%@\";styleSheet.id='%@';document.head.appendChild(styleSheet);}})()", id, escapedStyles, id];
}

static NSString *injectScript(WKWebView *webview, NSString *script) {
    __block NSString *resultString = nil;
    __block BOOL finished = NO;

    [webview evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
        if (error == nil) {
            if (result)
                resultString = [NSString stringWithFormat:@"%@", result];
        } else
            HBLogInfo(@"ChatGPTWebLegacyCompat evaluateJavaScript error : %@", error.description);
        finished = YES;
    }];

    while (!finished)
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate distantFuture]];

    return resultString;
}

static NSString *asScriptTag(NSString *scripts) {
    NSString *escapedScripts = [scripts stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escapedScripts = [escapedScripts stringByReplacingOccurrencesOfString:@"`" withString:@"\\`"];
    return [NSString stringWithFormat:@"(function(){function addScript(){const script = document.createElement('script');"
            "script.type = 'module';"
            "script.textContent = `%@`;"
            "document.body.appendChild(script);}"
            "if(document.body){addScript();}else{document.addEventListener('DOMContentLoaded',addScript);}})()", escapedScripts];
}

static void inject(WKWebView *webview) {
    if (![webview.URL.host containsString:@"chatgpt.com"]) return;
    [webview.configuration.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
    @try {
        [webview.configuration.preferences setValue:@YES forKey:@"allowUniversalAccessFromFileURLs"];
    } @catch (id ex) {}
    injectScript(webview, injectStyles(@"chatgpt-legacy-compat", kChatGPTWebLegacyCompatCSS));
    if (!IS_IOS_OR_NEWER(iOS_15_0)) {
        injectScript(webview, asScriptTag(scripts1));
        injectScript(webview, asScriptTag(scripts2));
    }
}

%hook WKWebView

- (void)_didCommitLoadForMainFrame {
    %orig;
    inject(self);
}

%end

%ctor {
    if (!isTarget(TargetTypeApps)) return;
    %init;
}
