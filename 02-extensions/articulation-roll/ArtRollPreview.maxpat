{
    "patcher": {
        "fileversion": 1,
        "appversion": {
            "major": 9,
            "minor": 1,
            "revision": 4,
            "architecture": "x64",
            "modernui": 1
        },
        "classnamespace": "box",
        "rect": [ 99.0, 557.0, 1180.0, 720.0 ],
        "boxes": [
            {
                "box": {
                    "id": "obj-c1",
                    "linecount": 3,
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 23.0, 10.0, 1080.0, 48.0 ],
                    "presentation_linecount": 3,
                    "text": "ArtRoll Preview — bridges the Articulation Roll editor to this track. (1) OSC /artroll/note <pitch> <vel> <durMs> <ksPitch> <ksHoldMs> on UDP 7474 injects click/preview notes. (2) /artroll/play <songTimeMs> and /artroll/stop drive Live's REAL transport: set current_song_time to the locate, then (after a 30ms delay so Live commits the move) call start_playing on live_set — without the delay Live starts from its old position and ignores the locate. So the editor's Play hears the whole arrangement in sync, FROM the clicked position. (3) A metro polls current_song_time + is_playing and sends /artroll/pos <songTimeMs> <isPlaying> back on UDP 7476 so the editor playhead follows Live. midiin->midiout passes the track's own MIDI through (without it the device would swallow all MIDI and the track would go silent). Put this device on the edited track, BEFORE the instrument. ksPitch -1 = no keyswitch."
                }
            },
            {
                "box": {
                    "id": "obj-1",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 23.0, 72.0, 110.0, 22.0 ],
                    "text": "udpreceive 7474"
                }
            },
            {
                "box": {
                    "id": "obj-2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 4,
                    "outlettype": [ "", "", "", "" ],
                    "patching_rect": [ 23.0, 107.0, 280.0, 22.0 ],
                    "text": "route /artroll/note /artroll/play /artroll/stop"
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 5,
                    "outlettype": [ "int", "int", "int", "int", "int" ],
                    "patching_rect": [ 23.0, 152.0, 140.0, 22.0 ],
                    "text": "unpack 0 0 0 0 0"
                }
            },
            {
                "box": {
                    "id": "obj-ksgate",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 243.0, 192.0, 107.0, 22.0 ],
                    "text": "if $i1 >= 0 then $i1"
                }
            },
            {
                "box": {
                    "id": "obj-ksmn",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 2,
                    "outlettype": [ "float", "float" ],
                    "patching_rect": [ 243.0, 267.0, 110.0, 22.0 ],
                    "text": "makenote 100 150"
                }
            },
            {
                "box": {
                    "id": "obj-pipe",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 23.0, 227.0, 55.0, 22.0 ],
                    "text": "pipe 5"
                }
            },
            {
                "box": {
                    "id": "obj-mn",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 2,
                    "outlettype": [ "float", "float" ],
                    "patching_rect": [ 23.0, 267.0, 110.0, 22.0 ],
                    "text": "makenote 100 300"
                }
            },
            {
                "box": {
                    "id": "obj-out",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 0,
                    "patching_rect": [ 23.0, 307.0, 70.0, 22.0 ],
                    "text": "noteout"
                }
            },
            {
                "box": {
                    "id": "obj-thru-in",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 423.0, 267.0, 50.0, 22.0 ],
                    "text": "midiin"
                }
            },
            {
                "box": {
                    "id": "obj-thru-out",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 423.0, 307.0, 55.0, 22.0 ],
                    "text": "midiout"
                }
            },
            {
                "box": {
                    "id": "obj-load",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 760.0, 72.0, 60.0, 22.0 ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-lpmsg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 760.0, 107.0, 100.0, 22.0 ],
                    "text": "path live_set"
                }
            },
            {
                "box": {
                    "id": "obj-lp",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 3,
                    "outlettype": [ "", "", "" ],
                    "patching_rect": [ 760.0, 142.0, 70.0, 22.0 ],
                    "text": "live.path"
                }
            },
            {
                "box": {
                    "id": "obj-lo",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 700.0, 192.0, 90.0, 22.0 ],
                    "text": "live.object"
                }
            },
            {
                "box": {
                    "id": "obj-play-t",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "float" ],
                    "patching_rect": [ 430.0, 142.0, 50.0, 22.0 ],
                    "text": "t b f"
                }
            },
            {
                "box": {
                    "id": "obj-div",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 470.0, 177.0, 50.0, 22.0 ],
                    "text": "/ 1000."
                }
            },
            {
                "box": {
                    "id": "obj-posset",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 470.0, 212.0, 170.0, 22.0 ],
                    "text": "prepend set current_song_time"
                }
            },
            {
                "box": {
                    "id": "obj-playdelay",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 410.0, 195.0, 60.0, 22.0 ],
                    "text": "delay 30"
                }
            },
            {
                "box": {
                    "id": "obj-startmsg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 430.0, 230.0, 120.0, 22.0 ],
                    "text": "call start_playing"
                }
            },
            {
                "box": {
                    "id": "obj-stopmsg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 580.0, 177.0, 120.0, 22.0 ],
                    "text": "call stop_playing"
                }
            },
            {
                "box": {
                    "id": "obj-metrostart",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 900.0, 107.0, 32.0, 22.0 ],
                    "text": "1"
                }
            },
            {
                "box": {
                    "id": "obj-metro",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 900.0, 142.0, 70.0, 22.0 ],
                    "text": "metro 30"
                }
            },
            {
                "box": {
                    "id": "obj-poll-t",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "bang" ],
                    "patching_rect": [ 900.0, 177.0, 50.0, 22.0 ],
                    "text": "t b b"
                }
            },
            {
                "box": {
                    "id": "obj-getpos",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 820.0, 230.0, 150.0, 22.0 ],
                    "text": "get current_song_time"
                }
            },
            {
                "box": {
                    "id": "obj-getplay",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 985.0, 230.0, 100.0, 22.0 ],
                    "text": "get is_playing"
                }
            },
            {
                "box": {
                    "id": "obj-route2",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 3,
                    "outlettype": [ "", "", "" ],
                    "patching_rect": [ 700.0, 267.0, 220.0, 22.0 ],
                    "text": "route current_song_time is_playing"
                }
            },
            {
                "box": {
                    "id": "obj-mul",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 700.0, 302.0, 50.0, 22.0 ],
                    "text": "* 1000"
                }
            },
            {
                "box": {
                    "id": "obj-posi",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 700.0, 337.0, 32.0, 22.0 ],
                    "text": "i"
                }
            },
            {
                "box": {
                    "id": "obj-playi",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 860.0, 302.0, 32.0, 22.0 ],
                    "text": "i"
                }
            },
            {
                "box": {
                    "id": "obj-pack",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 700.0, 372.0, 90.0, 22.0 ],
                    "text": "pack 0 0"
                }
            },
            {
                "box": {
                    "id": "obj-prepos",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 700.0, 407.0, 140.0, 22.0 ],
                    "text": "prepend /artroll/pos"
                }
            },
            {
                "box": {
                    "id": "obj-udpsend",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 700.0, 442.0, 160.0, 22.0 ],
                    "text": "udpsend 127.0.0.1 7476"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [ "obj-2", 0 ],
                    "source": [ "obj-1", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-3", 0 ],
                    "source": [ "obj-2", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-ksgate", 0 ],
                    "source": [ "obj-3", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-ksmn", 2 ],
                    "source": [ "obj-3", 4 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-ksmn", 1 ],
                    "order": 0,
                    "source": [ "obj-3", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-mn", 2 ],
                    "source": [ "obj-3", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-mn", 1 ],
                    "order": 1,
                    "source": [ "obj-3", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-pipe", 0 ],
                    "source": [ "obj-3", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-ksmn", 0 ],
                    "source": [ "obj-ksgate", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-out", 1 ],
                    "source": [ "obj-ksmn", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-out", 0 ],
                    "source": [ "obj-ksmn", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-out", 1 ],
                    "source": [ "obj-mn", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-out", 0 ],
                    "source": [ "obj-mn", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-mn", 0 ],
                    "source": [ "obj-pipe", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-thru-out", 0 ],
                    "source": [ "obj-thru-in", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lpmsg", 0 ],
                    "source": [ "obj-load", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-metrostart", 0 ],
                    "source": [ "obj-load", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lp", 0 ],
                    "source": [ "obj-lpmsg", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-lp", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-play-t", 0 ],
                    "source": [ "obj-2", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-div", 0 ],
                    "source": [ "obj-play-t", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-playdelay", 0 ],
                    "source": [ "obj-play-t", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-startmsg", 0 ],
                    "source": [ "obj-playdelay", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-posset", 0 ],
                    "source": [ "obj-div", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-posset", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-startmsg", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-stopmsg", 0 ],
                    "source": [ "obj-2", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-stopmsg", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-metro", 0 ],
                    "source": [ "obj-metrostart", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-poll-t", 0 ],
                    "source": [ "obj-metro", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-getpos", 0 ],
                    "source": [ "obj-poll-t", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-getplay", 0 ],
                    "source": [ "obj-poll-t", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-getpos", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-lo", 0 ],
                    "source": [ "obj-getplay", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-route2", 0 ],
                    "source": [ "obj-lo", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-mul", 0 ],
                    "source": [ "obj-route2", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-playi", 0 ],
                    "source": [ "obj-route2", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-posi", 0 ],
                    "source": [ "obj-mul", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-pack", 0 ],
                    "source": [ "obj-posi", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-pack", 1 ],
                    "source": [ "obj-playi", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-prepos", 0 ],
                    "source": [ "obj-pack", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-udpsend", 0 ],
                    "source": [ "obj-prepos", 0 ]
                }
            }
        ],
        "autosave": 0,
        "oscreceiveudpport": 0
    }
}
