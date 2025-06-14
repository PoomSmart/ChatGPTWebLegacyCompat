TARGET := iphone:clang:latest:15.0
INSTALL_TARGET_PROCESSES = MobileSafari

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = ChatGPTWebLegacyCompat

$(TWEAK_NAME)_FILES = Tweak.x
$(TWEAK_NAME)_CFLAGS = -fobjc-arc

include $(THEOS_MAKE_PATH)/tweak.mk

# CSS build target
css:
	npm run build

# Clean CSS build outputs
clean-css:
	rm -f ChatGPTWebLegacyCompatCSS.h processed.css

# Build CSS before compiling the tweak
before-all:: css

# Clean CSS files when cleaning
clean:: clean-css
