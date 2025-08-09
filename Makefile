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
$(TWEAK_NAME)_CFLAGS = -fobjc-arc

include $(THEOS_MAKE_PATH)/tweak.mk

ASSETS_PATH = layout/Library/Application Support/$(TWEAK_NAME)

js:
	@for file in scripts/*.js; do \
		base=$$(basename "$$file" .js); \
		npx babel "$$file" --out-file "$(ASSETS_PATH)/$$base.babel.js"; \
		npx uglifyjs "$(ASSETS_PATH)/$$base.babel.js" -o "$(ASSETS_PATH)/$$base.min.js"; \
		rm "$(ASSETS_PATH)/$$base.babel.js"; \
	done
	node fix-unicode.js

css:
	@for file in styles/*.css; do \
		base=$$(basename "$$file" .css); \
		npx postcss "$$file" --no-map -o "$(ASSETS_PATH)/$$base.post.css"; \
		npx cleancss "$(ASSETS_PATH)/$$base.post.css" -o "$(ASSETS_PATH)/$$base.min.css"; \
		rm "$(ASSETS_PATH)/$$base.post.css"; \
	done

assets: js css
