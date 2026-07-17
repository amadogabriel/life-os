# Adopt @dnd-kit for the Project Board

The Board (Inbox/Backlog/Sprint columns) needs drag-and-drop that works on touch and
auto-scrolls a wide, horizontally-scrolling row of columns. Every existing drag
interaction in this codebase (`TimelineEditor`'s reorder, `PlannerView`'s block-move) is
hand-rolled with pointer/HTML5-DnD events and no dependency — but neither solves
multi-container drag with touch and auto-scroll at once, which is exactly what the
Board needs. We adopted `@dnd-kit` rather than extending the hand-rolled patterns,
trading "no DnD dependency" for not re-solving touch/auto-scroll edge cases ourselves.
This is the app's first DnD library dependency.
