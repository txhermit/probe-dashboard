# Kismet web-only plugin: probe-dashboard
#
# Nothing to compile.  install / userinstall copy manifest.conf and httpd/
# into the Kismet plugin directory.
#
# PLUGIN_NAME must match the path in manifest.conf (plugin/probe-dashboard/...).

PLUGIN_NAME ?= probe-dashboard

KIS_SRC_DIR ?= /usr/src/kismet
KIS_INC_DIR ?= $(KIS_SRC_DIR)

-include $(KIS_SRC_DIR)/Makefile.inc

INSTALL ?= install

ifneq ("$(INSTUSR)", "")
INSTOWN = -o $(INSTUSR) -g $(INSTGRP)
endif

plugindir ?= $(shell pkg-config --variable=plugindir kismet 2>/dev/null)
ifeq ("$(plugindir)", "")
	plugindir := /usr/local/lib/kismet
	plugindirgeneric := 1
endif

SYSDIR  = $(DESTDIR)$(plugindir)/$(PLUGIN_NAME)
USERDIR = $(HOME)/.kismet/plugins/$(PLUGIN_NAME)

.PHONY: all install userinstall uninstall useruninstall clean

all:	manifest.conf

install:
ifeq ("$(plugindirgeneric)", "1")
	@echo "No kismet install found in pkgconfig, assuming $(plugindir)"
endif
	mkdir -p $(SYSDIR)
	$(INSTALL) $(INSTOWN) -m 444 manifest.conf $(SYSDIR)/manifest.conf
	mkdir -p $(SYSDIR)/httpd
	cp -r httpd/* $(SYSDIR)/httpd
	chmod -R a+rX $(SYSDIR)/httpd

userinstall:
	@echo "Installing to this user's home directory ($(HOME))"
	@echo "Note: if you run Kismet as root, it will NOT see this install."
	mkdir -p $(USERDIR)
	$(INSTALL) -m 444 manifest.conf $(USERDIR)/manifest.conf
	mkdir -p $(USERDIR)/httpd
	cp -r httpd/* $(USERDIR)/httpd

uninstall:
	rm -rf $(SYSDIR)

useruninstall:
	rm -rf $(USERDIR)

clean:
	@echo "Nothing to clean"
