# Mini Malloc Visualizer — real C allocator

```text
Browser → HTTP / JSON → Python http.server → ctypes → libminimalloc.so
                                                    heap/block/malloc/free.c
```

## 실행

Linux 또는 WSL에서 Python 3와 GCC가 필요합니다. Python 외부 패키지와 프런트엔드 빌드는 필요하지 않습니다.

```sh
cd ~/mini-malloc
python3 visualizer/server.py
```

Windows 브라우저에서 **http://localhost:8000**을 엽니다. 서버는 `127.0.0.1`에만 bind합니다. WSL의 localhost 포워딩을 사용합니다. 기존 `python3 -m http.server 8000`이 켜져 있으면 해당 터미널에서 Ctrl+C로 종료한 뒤 새 서버를 실행하세요. 정적 파일 서버만으로는 allocator API를 사용할 수 없습니다.

서버 시작 시 프로젝트 루트에 `libminimalloc.so`를 자동 빌드합니다. 수동 빌드 명령은 다음과 같습니다.

```sh
gcc -std=gnu11 -Wall -Wextra -Werror -shared -fPIC \
    heap.c block.c malloc.c free.c -o libminimalloc.so
```

종료는 Ctrl+C입니다. 다른 포트가 필요하면 `python3 visualizer/server.py --port 8001`을 사용하세요.

## 사용

초기 heap은 256 B입니다. 통계 위의 **Heap configuration**에서 숫자를 입력하거나 128/256/512/1024 B preset을 선택한 뒤 Initialize / Reinitialize heap을 누릅니다. Preset은 입력값만 변경합니다. 기존 `/api/init`를 통해 실제 C heap을 재생성하며, 모든 변수·포인터도 초기화됩니다. 사용 중인 allocation이 있으면 확인 메시지를 표시합니다.

크기는 1–1,048,576 B 범위의 정수입니다. C `alignment()`가 최소 header 16 B를 담을 수 있도록 올림하며, 예를 들어 17 B 입력 시 실제 32 B로 생성됩니다. 요청 크기와 실제 크기는 설정 영역에 함께 표시됩니다. 0, 음수, 소수, 숫자가 아닌 값은 거부합니다.

기존 command terminal에는 malloc/free 명령을 한 줄씩 입력하고 Enter 또는 Run을 누릅니다.

```c
void *a = malloc(17);
free(a);
exit;
```

- `mini_malloc` / `mini_free`와 split, first-fit, alignment, coalescing은 모두 **기존 C 함수**에서 수행합니다. JS/Python에는 allocator 알고리즘이 없습니다.
- Python 테이블은 변수 이름, 실제 payload 포인터, 요청 크기, active 상태만 관리합니다. 변수 최대 100개, 이름 최대 31자입니다. 해제한 이름도 재선언할 수 없고, 없는 변수나 중복 free는 거부합니다.
- Reset heap은 C heap을 destroy한 뒤 마지막으로 설정한 크기로 새로 만듭니다. `exit;`는 heap만 해제하며 HTTP 서버는 계속 실행됩니다.
- 브라우저 새로고침은 현재 C heap을 다시 읽습니다. 서버 하나가 heap 하나를 소유하므로 여러 탭은 같은 heap을 공유합니다. 다른 탭의 변경은 새로고침 또는 다음 API 응답에서 반영됩니다.
- 연결 오류에는 기존 화면이 마지막 snapshot으로 남고 DISCONNECTED를 표시합니다. 명령은 자동 재전송하지 않습니다.

## API

POST 요청은 `Content-Type: application/json`을 사용합니다.

| Endpoint | 입력 | 동작 |
|---|---|---|
| `GET /api/state` | 없음 | 실제 C heap을 읽음 |
| `POST /api/init` | `{"heap_size":256}` | C `alignment`, destroy, allocate, init header |
| `POST /api/command` | `{"command":"void *a = malloc(17);"}` | 제한된 C-like malloc/free/exit 실행 |
| `POST /api/reset` | `{}` 또는 빈 body | 같은 초기 크기로 heap 재생성 |

응답은 `{"ok":true,"message":"...","state":{...}}`입니다. 명령/입력 오류는 HTTP 400이며 `ok:false`와 현재 snapshot을 반환합니다. Heap 크기는 양의 정수 최대 1 MiB이며, C `alignment()`로 정렬됩니다. 웹 요청이 shell 명령을 실행하는 경로는 없습니다. 서버 시작 시에만 고정된 GCC 인수로 빌드합니다.

`state`는 `heap_size`, `initial_heap_size`, `active`, `source:"c-allocator"`, `stats`, `blocks`를 포함합니다. 각 block은 다음 필드를 제공합니다.

```json
{
  "offset": 0,
  "total_size": 48,
  "allocated": true,
  "variable": "a",
  "requested_size": 17,
  "aligned_payload_size": 32,
  "header_size": 16,
  "payload_capacity": 32,
  "internal_fragmentation": 15,
  "alignment_padding": 15,
  "unsplit_remainder": 0,
  "size_and_flag": 49,
  "allocation_flag": 1
}
```

`heap_start`, `heap_end`, `heap_size`는 C의 전역 심볼에서 읽습니다. 경계를 검사한 후 실제 header 주소에 C `get_block_size()`와 `is_allocated()`를 호출하고 `size_and_flag`를 직접 읽습니다. 순회는 현재 block size만큼 전진하므로 coalescing 후 남은 오래된 header를 방문하지 않습니다. Requested만 Python 테이블에서 얻으며 aligned payload는 C `alignment()` 결과입니다. ctypes 구조체는 `block.h`의 native ABI에 대응합니다. 현재 16 B BlockHeader를 사용하는 64-bit 환경을 지원합니다.

## 화면 읽기

- 모든 USED/FREE block은 header와 payload로 나뉩니다. 너비는 실제 byte 비율이며 주소는 `heap_start` 기준 상대 offset입니다. 끝 offset은 exclusive입니다.
- Block을 선택하면 requested/aligned/header/total/fragmentation과 실제 `size_and_flag`의 LSB를 확인할 수 있습니다. 작은 block은 상세 표와 선택 영역에서 확인하세요.
- Used bytes는 allocated block 전체 합계, Free bytes는 free block 전체 합계입니다.
- Header overhead는 **모든 block의 header 합계**이며 allocated/free 부분도 표시합니다.
- Internal fragmentation은 allocated block의 payload capacity에서 requested를 뺀 값으로, 정렬 padding과 split하지 않은 잔여 공간을 포함합니다.
- `malloc(17)`은 total 48 B, raw header 49, fragmentation 15 B입니다. 남은 free block에도 header가 있어 전체 header overhead는 32 B입니다.
- 변경 강조와 coalescing 설명은 이전/이후 **서버 snapshot**을 비교하는 표시 기능입니다. JS가 block을 할당하거나 합치지 않습니다. reduced-motion도 지원합니다.

## 검증

```sh
python3 visualizer/server_test.py
```

임시 localhost 포트에 서버를 띄워 실제 shared library/API와 C 메모리를 검사합니다. Node.js가 있으면 UI 이벤트 → 실제 HTTP → C → 렌더링까지 함께 검사합니다. 이 UI 테스트의 DOM은 대역이며 브라우저 CSS 배치 검사를 대신하지는 않습니다.

실행 중인 서버에 UI 테스트만 수행하려면 다음 명령을 사용합니다. **해당 서버의 heap을 초기화합니다.**

```sh
node visualizer/app.test.js http://127.0.0.1:8000
```

기존 `main.c` REPL과 allocator core는 변경하지 않았습니다.

## GitHub Pages / WASM 모드

Python 서버 없이 기존 UI를 실행하는 정적 빌드는 `./scripts/build_wasm.sh`로 생성합니다. 결과는 Git에서 제외되는 `dist/`에 저장됩니다. 기존 로컬 Python 실행 방식은 그대로 유지됩니다. 빌드·설계·테스트·Pages 설정은 [wasm/README.md](../wasm/README.md)를 참고하세요.
