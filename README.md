\# MusorOK Courier App



Courier application for MusorOK — on-demand household waste pickup service.



\## Overview



This app is used by couriers to:



\- view active orders

\- open order details

\- update order statuses

\- sync changes with Supabase in real time



\## Product flow



Client App → Supabase → Courier App → Client Realtime Updates



\## Current features



\- active orders list

\- order details screen

\- order status workflow

\- realtime updates from Supabase



\## Status flow



\- new

\- assigned

\- on\_the\_way

\- arrived

\- done

\- cancelled



\## Tech stack



\- Expo

\- React Native

\- TypeScript

\- Expo Router

\- Supabase



\## Project structure



```txt

app/

&nbsp; \_layout.tsx

&nbsp; index.tsx

&nbsp; order/\[id].tsx



lib/

&nbsp; supabase.ts

&nbsp; orders.ts



types/

&nbsp; order.ts

