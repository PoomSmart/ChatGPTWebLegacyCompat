TARGET := iphone:clang:latest:14.0
INSTALL_TARGET_PROCESSES = MobileSafari

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = ChatGPTWebLegacyCompat

$(TWEAK_NAME)_FILES = Tweak.x
$(TWEAK_NAME)_CFLAGS = -fobjc-arc -Wno-trigraphs

include $(THEOS_MAKE_PATH)/tweak.mk

# CSS build target
css:
	npm run build

# JS build target
js:
	@./generate_polyfill_header.sh scripts1 Polyfills1 scripts1
	@./generate_polyfill_header.sh scripts2 Polyfills2 scripts2

# Clean CSS build outputs
clean-css:
	rm -f ChatGPTWebLegacyCompatCSS.h processed.css

# Clean JS build outputs
clean-js:
	rm -f Polyfills*.h

# Build CSS before compiling the tweak
before-all:: css js

# Clean CSS files when cleaning
clean:: clean-css clean-js
