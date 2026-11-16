# How the "drag to install" window looks. Read by dmgbuild (see scripts/make-dmg.sh).
# The picture is background.html, drawn by render.mjs; positions here match it.
import os

app = defines["app"]            # noqa: F821  (dmgbuild provides `defines`)
here = defines["here"]          # noqa: F821  apps/mac

format = "ULFO"
filesystem = "HFS+"
files = [app]
symlinks = {"Applications": "/Applications"}
hide_extensions = [os.path.basename(app)]   # the name reads "SynAmp", not "SynAmp.app"
icon = os.path.join(here, "icon", "AppIcon.icns")   # the disk's own icon
background = defines["background"]  # noqa: F821

default_view = "icon-view"
# 28 of the height is the title bar. Finder's path bar and status bar, when a
# person has them on, take about 56 more: the picture keeps its words above that.
window_rect = ((220, 160), (660, 490))
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
include_icon_view_settings = True
arrange_by = None
icon_size = 128
text_size = 13
label_pos = "bottom"
icon_locations = {
    os.path.basename(app): (170, 190),
    "Applications": (490, 190),
    # The disk's own hidden files. People who have Finder show hidden files would
    # see them poke into the window: park them well below it.
    ".background.tiff": (170, 760),
    ".VolumeIcon.icns": (490, 760),
}
