# Development
pnpm dev                    # Start web server with hot reload
pnpm cli generate           # Generate shorts from configured channels/URLs
pnpm cli generate:top       # Send top unposted video (full) to Telegram/YouTube
pnpm cli generate:comic --demo         # Narrate the built-in comic smoke-test book (Flashpoint)
pnpm cli generate:movie --demo         # Narrate the built-in movie-recap smoke-test book (Shrek)
pnpm cli generate:series --demo        # Narrate the built-in series-recap smoke-test book (The Flash 1x01)
pnpm cli generate:bio --demo           # Narrate the built-in biography smoke-test book (Ada Lovelace)
pnpm cli generate:news --demo          # Narrate the built-in news-digest smoke-test book (example headlines)
pnpm cli generate:book --demo          # Narrate the built-in book-recap smoke-test book (Dom Casmurro)
pnpm cli generate:<kind> --book <path.json>  # Any kind: narrate a custom ComicBook definition
pnpm cli generate:faceless --topic "assunto"  # Faceless short: LLM script + Pexels stock footage + edge-tts narration

# Testing
pnpm test                   # Run all tests once
pnpm test:watch             # Watch mode
pnpm test:coverage          # Generate coverage report

# Type checking
pnpm build                  # TypeScript type-check (no emit)

# Web UI
pnpm web:dev                # Start React frontend (Vite, separate from API)
