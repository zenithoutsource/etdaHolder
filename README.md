OID4VCI Wallet Application

Welcome to your universal decentralized digital wallet application developed using Expo.

Getting Started

1. Install Dependencies

Run the following command to download and map dependencies using Yarn Classic:

yarn install


2. Start the App

Start the local Metro Bundler server:

yarn start


In the output terminal, select options to open the application in:

A Development Build (via npx expo prebuild configuration)

Android Emulator

iOS Simulator

Expo Go (development sandbox)

You can begin UI or logic developments inside the app or src directory. This project utilizes file-based routing.

Project Structure

This project enforces a clean separation of concerns and runs entirely on the Hermes JavaScript engine:

src/services/crypto/ - Hardware key management via @animo-id/expo-secure-environment. (Phase 1, implemented)

src/services/storage/ - Encrypted MMKV credential store + keychain key management. (Phase 1, implemented)

src/services/vci/ - Handlers for credential exchange under OID4VCI 1.0. (Phase 2, planned)

src/sdk/ - Compiled API client generated via Orval. (Phase 2, planned)

Developer Documentation

Refer to the following configuration rules in the root folder before committing code changes:

CLAUDE.md - Command, environment, and development conventions.

CONTEXT.md - Definition of domain glossaries.

TASKS.md - Active daily micro-task checklist.

AGENTS.md - Roadmap and project milestones.