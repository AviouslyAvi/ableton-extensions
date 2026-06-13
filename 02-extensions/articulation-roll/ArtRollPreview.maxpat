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
        "rect": [ 99.0, 557.0, 640.0, 578.0 ],
        "boxes": [
            {
                "box": {
                    "id": "obj-c1",
                    "linecount": 2,
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 23.0, 77.0, 1010.0, 33.0 ],
                    "presentation_linecount": 2,
                    "text": "ArtRoll Preview — receives OSC /artroll/note <pitch> <vel> <durMs> <ksPitch> <ksHoldMs> on UDP 7474 and injects preview notes. midiin->midiout passes the track's own MIDI through to the instrument (without it, the device would swallow all incoming MIDI and the track would go silent). Put this device on the edited track, BEFORE the instrument. ksPitch -1 = no keyswitch."
                }
            },
            {
                "box": {
                    "id": "obj-1",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 23.0, 112.0, 110.0, 22.0 ],
                    "text": "udpreceive 7474"
                }
            },
            {
                "box": {
                    "id": "obj-2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 23.0, 147.0, 120.0, 22.0 ],
                    "text": "route /artroll/note"
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 5,
                    "outlettype": [ "int", "int", "int", "int", "int" ],
                    "patching_rect": [ 23.0, 182.0, 140.0, 22.0 ],
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
                    "patching_rect": [ 243.0, 222.0, 107.0, 22.0 ],
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
                    "patching_rect": [ 243.0, 297.0, 110.0, 22.0 ],
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
                    "patching_rect": [ 23.0, 257.0, 55.0, 22.0 ],
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
                    "patching_rect": [ 23.0, 297.0, 110.0, 22.0 ],
                    "text": "makenote 100 300"
                }
            },
            {
                "box": {
                    "id": "obj-out",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 0,
                    "patching_rect": [ 23.0, 337.0, 70.0, 22.0 ],
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
                    "patching_rect": [ 423.0, 297.0, 50.0, 22.0 ],
                    "text": "midiin"
                }
            },
            {
                "box": {
                    "id": "obj-thru-out",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 423.0, 337.0, 55.0, 22.0 ],
                    "text": "midiout"
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
            }
        ],
        "autosave": 0,
        "oscreceiveudpport": 0
    }
}