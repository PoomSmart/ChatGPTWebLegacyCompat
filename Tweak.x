#define CHECK_TARGET
#import <PSHeader/PS.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <WebKit/WKWebView.h>
#import <version.h>
#import "ChatGPTWebLegacyCompatCSS.h"

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

static void inject(WKWebView *webview) {
    if (![webview.URL.host containsString:@"chatgpt.com"]) return;
    if (!IS_IOS_OR_NEWER(iOS_16_0)) {
        if (!IS_IOS_OR_NEWER(iOS_15_4)) {
            injectScript(webview, injectStyles(@"chatgpt-legacy-compat-1", kChatGPTWebLegacyCompatRoot1CSS));
            injectScript(webview, injectStyles(@"chatgpt-legacy-compat-3", kChatGPTWebLegacyCompatConversationSmallCSS));
        }
        injectScript(webview, injectStyles(@"chatgpt-legacy-compat-2", kChatGPTWebLegacyCompatRoot2CSS));
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
