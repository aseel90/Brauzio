# Brauzio MCP Tools

المرجع النهائي للمخططات هو `packages/shared/src/tools.ts`. هذه الصفحة تلخص الأدوات المدعومة في V2.

## Browser / Tabs

- `get_windows_and_tabs`
- `chrome_navigate`
- `chrome_close_tabs`
- `chrome_switch_tab`
- `chrome_history`
- `chrome_bookmark_search`
- `chrome_bookmark_add`
- `chrome_bookmark_delete`

## Read / Inspect

- `chrome_read_page`
- `chrome_get_web_content`
- `chrome_get_interactive_elements`
- `chrome_console`
- `chrome_javascript`

## Interaction

- `chrome_computer`
- `chrome_click_element`
- `chrome_fill_or_select`
- `chrome_keyboard`
- `chrome_request_element_selection`
- `chrome_handle_dialog`
- `chrome_upload_file`
- `chrome_handle_download`

## Visual

- `chrome_screenshot`
- `chrome_gif_recorder`

## Network

- `chrome_network_capture`
- `chrome_network_request`

## Performance

- `performance_start_trace`
- `performance_stop_trace`
- `performance_analyze_insight`

## chrome_computer — Virtual Mouse

أهم أوامر الماوس الجديدة:

| action | الوظيفة |
| --- | --- |
| `mouse_move` | تحريك مؤشر Brauzio إلى إحداثيات مع إبقاء حالة الزر الحالية |
| `mouse_down` | ضغط زر الماوس وإبقاؤه مضغوطًا |
| `mouse_up` | تحرير الزر المضغوط |
| `drag_hold` | سحب تدريجي ثم إبقاء الضغط عند الوجهة لمدة محددة |
| `left_click_drag` | سحب تقليدي سريع |
| `hover` | التحويم فوق عنصر |

تدعم `chrome_computer` أيضًا click, scroll, type, key, fill, wait, screenshot, resize وzoom.

### مثال منطقي لتحريك Virtual Joystick

```text
mouse_move → مركز الستيك
mouse_down
mouse_move → جهة اليمين
... إبقاء الحالة ...
mouse_up
```

يجب تقييم نجاح الحركة من حالة التطبيق أو قيم الإدخال أثناء الضغط، وليس من تغير موضع عنصر قد يتأثر بالـknockback أو physics.

## Removed tools

لا توجد أدوات Record/Replay أو Workflow أو Vector Search في MCP V2.
