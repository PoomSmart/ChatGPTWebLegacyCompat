#define CHECK_TARGET
#import <PSHeader/PS.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <WebKit/WKPreferences.h>
#import <WebKit/WKWebView.h>
#import <WebKit/WKWebViewConfiguration.h>
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

static NSString *injectScript(WKWebView *webview, NSString *identifier, NSString *script) {
    __block NSString *resultString = nil;
    __block BOOL finished = NO;

    [webview evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
        if (error == nil) {
            if (result)
                resultString = [NSString stringWithFormat:@"%@", result];
        } else
            HBLogDebug(@"ChatGPTWebLegacyCompat evaluateJavaScript (%@) error : %@", identifier, error.description);
        finished = YES;
    }];

    while (!finished)
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate distantFuture]];

    return resultString;
}

static NSString *escapedScripts(NSString *input) {
    NSString *escaped = [input stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
    return escaped;
}

static NSString *asScriptTag(NSString *scripts) {
    return [NSString stringWithFormat:@"(function(){function addScript(){const script = document.createElement('script');"
            "script.type = 'module';"
            "script.textContent = \"%@\";"
            "document.body.appendChild(script);}"
            "if(document.body){addScript();}else{document.addEventListener('DOMContentLoaded',addScript);}})()", escapedScripts(scripts)];
}

static void inject(WKWebView *webview) {
    if (![webview.URL.host containsString:@"chatgpt.com"]) return;
    if (!IS_IOS_OR_NEWER(iOS_16_0)) {
        if (!IS_IOS_OR_NEWER(iOS_15_4)) {
            injectScript(webview, @"chatgpt-legacy-css-2", injectStyles(@"chatgpt-legacy-compat-1", kChatGPTWebLegacyCompatRoot1CSS));
            injectScript(webview, @"chatgpt-legacy-css-3", injectStyles(@"chatgpt-legacy-compat-3", kChatGPTWebLegacyCompatConversationSmallCSS));
        }
        injectScript(webview, @"chatgpt-legacy-css-1", injectStyles(@"chatgpt-legacy-compat-2", kChatGPTWebLegacyCompatRoot2CSS));
        if (!IS_IOS_OR_NEWER(iOS_15_0)) {
            [webview.configuration.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
            @try {
                [webview.configuration.preferences setValue:@YES forKey:@"allowUniversalAccessFromFileURLs"];
            } @catch (id ex) {}
            NSString *scriptsFolder = ROOT_PATH_NS(@"/Library/Application Support/ChatGPTWebLegacyCompat");
            NSArray *scripts = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:scriptsFolder error:nil];
            NSPredicate *predicate = [NSPredicate predicateWithFormat:@"self ENDSWITH '.js'"];
            NSArray *jsFiles = [scripts filteredArrayUsingPredicate:predicate];
            for (NSString *jsFile in jsFiles) {
                NSString *filePath = [scriptsFolder stringByAppendingPathComponent:jsFile];
                NSString *fileName = [jsFile stringByDeletingPathExtension];
                NSString *scriptContent = [NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:nil];
                if ([jsFile hasSuffix:@"-module.min.js"]) {
                    injectScript(webview, fileName, asScriptTag(scriptContent));
                } else {
                    injectScript(webview, fileName, scriptContent);
                }
            }
        }
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
