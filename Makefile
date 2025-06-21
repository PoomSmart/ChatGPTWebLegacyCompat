ifeq ($(THEOS_PACKAGE_SCHEME),rootless)
TARGET = iphone:clang:latest:15.0
else
TARGET = iphone:clang:14.5:14.0
export PREFIX = $(THEOS)/toolchain/Xcode11.xctoolchain/usr/bin/
endif

INSTALL_TARGET_PROCESSES = MobileSafari

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = ChatGPTWebLegacyCompat

$(TWEAK_NAME)_FILES = Tweak.x
$(TWEAK_NAME)_CFLAGS = -fobjc-arc -Wno-trigraphs

include $(THEOS_MAKE_PATH)/tweak.mk

JS_PATH = layout/Library/Application Support/ChatGPTWebLegacyCompat

# CSS build target
css:
	npm run build

# JS build target
js:
	@for file in scripts/*.js; do \
		base=$$(basename "$$file" .js); \
		npx babel "$$file" --out-file "$(JS_PATH)/$$base.babel.js"; \
		npx uglifyjs "$(JS_PATH)/$$base.babel.js" -o "$(JS_PATH)/$$base.min.js"; \
		rm "$(JS_PATH)/$$base.babel.js"; \
	done
	node fix-unicode.js

# Clean CSS build outputs
clean-css:
	rm -f ChatGPTWebLegacyCompatCSS.h processed-*.css

# Clean JS build outputs
clean-js:
	rm -f Polyfills*.h

# Build CSS before compiling the tweak
before-all:: css js

# Clean CSS files when cleaning
clean:: clean-css clean-js
