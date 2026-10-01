---
'@yuigram/mtproto': minor
'yuigram': minor
---

`bootstrapAt({ dc, host, port, testMode? })` builds the address list an account starts from out of
the one datacenter an application names, in place of a configuration literal with every flag
spelled out. The address is checked where it is written: a hostname, a port out of range or a
datacenter identifier that is not a positive integer is a `ValidationError` rather than a
connection that later fails. `DcConfiguration`, `DcAddress` and `BootstrapAddress` are exported, so
a configuration built some other way can be typed.
