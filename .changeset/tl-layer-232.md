---
"@yuigram/mtproto": minor
---

TL layer 232, from 229.

The raw API gains what the layers between added: a TON wallet, on-ramp purchases,
share themes and tokens that waive paid messages, 63 constructors and 46 methods in
all. Service messages read three new actions: `gram-transfer`,
`wallet-connect-request` and `no-paid-messages-token-used`.

Telegram changed five existing parts of the raw API incompatibly. The raw API
follows the schema in a minor release (docs/codegen.md §7):

- `botVerification.description` and `botVerifierSettings.custom_description` are
  formatted text (`TextWithEntities`) rather than strings, and
  `bots.setCustomVerification` takes one.
- `payments.getStarGiftWithdrawalUrl` takes a `tmp_password` from
  `account.getTmpPassword` where it took a `password` proof. `giftWithdrawalUrl`
  keeps its signature and asks for the temporary password itself.
- `inputPasskeyCredentialFirebasePNV` is gone.
