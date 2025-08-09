#define CHECK_TARGET
#import <PSHeader/PS.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <WebKit/WKPreferences.h>
#import <WebKit/WKWebView.h>
#import <WebKit/WKWebViewConfiguration.h>
#import <WebKit/WKUserContentController.h>
#import <WebKit/WKUserScript.h>
#import <version.h>

static NSString *escapedScripts(NSString *input) {
    NSString *escaped = [input stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"`" withString:@"\\`"];
    return escaped;
}

static NSString *injectStyles(NSString *identifier, NSString *styles) {
    return [NSString stringWithFormat:@"(function(){if(document.getElementById('%@')===null){const styleSheet=document.createElement('style');styleSheet.type='text/css';styleSheet.innerText=`%@`;styleSheet.id='no-polyfill-%@';document.head.appendChild(styleSheet);}})();", identifier, escapedScripts(styles), identifier];
}

static void injectScript(WKWebView *webview, NSString *identifier, NSString *script) {
    WKUserScript *userScript = [[WKUserScript alloc] initWithSource:script injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES];
    [webview.configuration.userContentController addUserScript:userScript];
}

static NSString *asScriptTag(NSString *scripts) {
    return [NSString stringWithFormat:@"(function(){function addScript(){const script = document.createElement('script');"
            "script.type = 'module';"
            "script.textContent = \"%@\";"
            "document.body.appendChild(script);}"
            "if(document.body){addScript();}else{document.addEventListener('DOMContentLoaded',addScript);}})()", escapedScripts(scripts)];
}

static const void *GPTInjectedKey = &GPTInjectedKey;

static void inject(WKWebView *webview) {
    if (![webview.URL.host containsString:@"chatgpt.com"]) return;
    WKUserContentController *controller = webview.configuration.userContentController;
    if (!controller) {
        controller = [[WKUserContentController alloc] init];
        webview.configuration.userContentController = controller;
    } else if (objc_getAssociatedObject(controller, GPTInjectedKey)) return;
    objc_setAssociatedObject(controller, GPTInjectedKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    if (!IS_IOS_OR_NEWER(iOS_16_0)) {
        NSArray *ios15_4_cssFiles = @[@"root-base.min", @"root-base-overrides.min", @"conversation-small.min"];
        NSString *assetsFolder = PS_ROOT_PATH_NS(@"/Library/Application Support/ChatGPTWebLegacyCompat");
        NSArray *assets = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:assetsFolder error:nil];
        NSPredicate *cssPredicate = [NSPredicate predicateWithFormat:@"self ENDSWITH '.css'"];
        NSArray *cssFiles = [assets filteredArrayUsingPredicate:cssPredicate];
        for (NSString *cssFile in cssFiles) {
            NSString *filePath = [assetsFolder stringByAppendingPathComponent:cssFile];
            NSString *fileName = [cssFile stringByDeletingPathExtension];
            if (IS_IOS_OR_NEWER(iOS_15_4) && [ios15_4_cssFiles containsObject:fileName]) continue;
            if (!IS_IOS_OR_NEWER(iOS_15_4) && [fileName isEqualToString:@"root-container.min"]) continue;
            NSString *cssContent = [NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:nil];
            if (cssContent) {
                NSString *cssIdentifier = [fileName stringByReplacingOccurrencesOfString:@"-" withString:@"_"];
                injectScript(webview, cssIdentifier, injectStyles(cssIdentifier, cssContent));
            } else
                HBLogDebug(@"ChatGPTWebLegacyCompat failed to read CSS file %@", cssFile);
        }
        if (!IS_IOS_OR_NEWER(iOS_15_0)) {
            [webview.configuration.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
            @try {
                [webview.configuration.preferences setValue:@YES forKey:@"allowUniversalAccessFromFileURLs"];
            } @catch (id ex) {}
            NSPredicate *jsPredicate = [NSPredicate predicateWithFormat:@"self ENDSWITH '.js'"];
            NSArray *jsFiles = [assets filteredArrayUsingPredicate:jsPredicate];
            for (NSString *jsFile in jsFiles) {
                NSString *filePath = [assetsFolder stringByAppendingPathComponent:jsFile];
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
