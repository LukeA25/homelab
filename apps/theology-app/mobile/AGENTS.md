# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Do not upgrade past SDK 54

Two independent ceilings pin this project, and the lower one wins:

1. **The device.** The target iPad is an **iPad mini 4 (`iPad5,1`)** on iPadOS 15.8.8, which is
   its final OS. Expo SDK 56 raised the iOS floor from 15.1 to 16.4 and explicitly dropped the
   iPad mini 4 and iPad Air 2, so SDK 56+ can never run on it. Ceiling: **SDK 55**.

2. **Expo Go.** The App Store build of Expo Go is **54.0.2**, which supports **SDK 54 only**.
   Expo Go for SDK 55 was submitted in May 2026 but never cleared Apple review, so it cannot be
   installed from the App Store. Ceiling: **SDK 54**.

SDK 54 satisfies both: it has an iOS 15.1 floor and matches App Store Expo Go. Upgrading to 55
would silently break the Expo Go workflow; upgrading to 56+ breaks the device entirely.
