# IR Project AI 1.7.214 — сборка настоящего офлайн-пакета Qwen3-VL 4B

## Что появилось

До этого менеджер IR Project AI распознавал только **готовые подписанные** пакеты `.ir-ai-pack`, но средства безопасно создавать такие пакеты из официальных Windows-бинарников и GGUF-файлов не было.

Новые инструменты издателя:
- `scripts/ai-pack-publisher.js` — проверка исходных SHA-256, GGUF, Windows MZ, сборка ZIP, подписание Ed25519, повторная проверка собранного архива по каждому файлу.
- `scripts/build-qwen4-pack.js` — командная строка для Qwen3-VL 4B.
- `scripts/sign-ai-catalog.js` — публикационный генератор подписанного каталога с SHA-256 готового пакета и проверкой подписи пакета перед публикацией.
- `scripts/test-ai-pack-publisher.js` — сквозная проверка создания подписанного ZIP, каталога и установки в существующий менеджер моделей, а также проверка отказов при несовпадении SHA и некорректных входных файлах.

**Модель и движок по-прежнему не включаются в маленький установщик IR Project.** Они распространяются отдельным пакетом.

## Официальные источники (конкретные названия)

Модель: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/tree/main

Из данного репозитория нужны:
- `Qwen3VL-4B-Instruct-Q4_K_M.gguf` — около 2,5 ГБ.
- `mmproj-Qwen3VL-4B-Instruct-F16.gguf` — около 836 МБ.

Движок: https://github.com/ggml-org/llama.cpp/releases
- Требуется согласованная версия **Windows x64**, например CPU или CUDA 12.
- Нужны `llama-server.exe` и все совместимые DLL в общей папке, включая комплект CUDA-библиотек при использовании CUDA, с соблюдением лицензий компонентов.
- Перед официальным выпуском нужно проверить модель именно с выбранным **точным релизом llama.cpp**, в том числе поддержку Qwen3-VL и визуального проектора.
- Для RTX 4050 Laptop (6 ГБ видеопамяти) начать с `--gpu-layers 0` (CPU) как безопасного варианта и измерять использование VRAM при увеличении числа слоёв.
- Состав CUDA DLL зависит от конкретного релиза и комплекта; автоматический сборщик не гарантирует совместимость бинарника без реального запуска.

## Подготовка файлов у издателя (Windows PowerShell)

Вне Git-репозитория создать отдельные папки:
```text
C:\IR-AI-Publisher\models\Qwen3VL-4B-Instruct-Q4_K_M.gguf
C:\IR-AI-Publisher\models\mmproj-Qwen3VL-4B-Instruct-F16.gguf
C:\IR-AI-Publisher\runtime\llama-server.exe
C:\IR-AI-Publisher\runtime\*.dll
C:\IR-AI-Publisher\keys\publisher-ed25519-private.pem
```

Сначала сверить хэши с официальной опубликованной информацией производителя. Простое вычисление SHA-256 после скачивания не подтверждает происхождение файла, если сравнивать не с чем:
```powershell
Get-FileHash C:\IR-AI-Publisher\models\Qwen3VL-4B-Instruct-Q4_K_M.gguf -Algorithm SHA256
Get-FileHash C:\IR-AI-Publisher\models\mmproj-Qwen3VL-4B-Instruct-F16.gguf -Algorithm SHA256
Get-FileHash C:\IR-AI-Publisher\runtime\llama-server.exe -Algorithm SHA256
```

После проверки исходников сформировать закрытый ключ Ed25519 **офлайн** (например, OpenSSL):
```powershell
openssl genpkey -algorithm Ed25519 -out C:\IR-AI-Publisher\keys\publisher-ed25519-private.pem
openssl pkey -in C:\IR-AI-Publisher\keys\publisher-ed25519-private.pem -pubout -out C:\IR-AI-Publisher\keys\publisher-ed25519-public.pem
```

**Закрытый ключ нельзя добавлять в GitHub, логи Actions, файлы модели или установщик.** Утверждённый открытый ключ необходимо отдельно включить в новую подписанную версию программы, в `TRUSTED_MODEL_KEYS`, после сверки отпечатка и владельца ключа. До этого установка безопасно заблокирована.

## Создание `.ir-ai-pack`

Из корня репозитория (после `npm install`):

```powershell
node scripts/build-qwen4-pack.js `
  --version 1.0.0 `
  --model "C:\IR-AI-Publisher\models\Qwen3VL-4B-Instruct-Q4_K_M.gguf" `
  --mmproj "C:\IR-AI-Publisher\models\mmproj-Qwen3VL-4B-Instruct-F16.gguf" `
  --runtime-dir "C:\IR-AI-Publisher\runtime" `
  --model-sha256 "<ПРОВЕРЕННЫЙ_SHA256_МОДЕЛИ>" `
  --mmproj-sha256 "<ПРОВЕРЕННЫЙ_SHA256_ЭНКОДЕРА>" `
  --binary-sha256 "<ПРОВЕРЕННЫЙ_SHA256_LLAMA_SERVER>" `
  --key-file "C:\IR-AI-Publisher\keys\publisher-ed25519-private.pem" `
  --key-id "ir-ai-publisher-2026" `
  --gpu-layers 0 `
  --app-min 1.7.214 `
  --model-revision "<ПРОВЕРЕННЫЙ_КОММИТ_HUGGINGFACE>" `
  --llama-release "<ЗАКРЕПЛЁННЫЙ_РЕЛИЗ_LLAMA>" `
  --out "C:\IR-AI-Publisher\qwen3-vl-4b-1.0.0.ir-ai-pack"
```

Имена параметров являются частью CLI; многострочная запись PowerShell использует символ обратной кавычки ` в конце строк.

Инструмент НЕ начинает скачивание и НЕ подписывает произвольные данные без заданного закрытого ключа и трёх хэшей исходных файлов. Для модели и энкодера проверяется заголовок GGUF; для Windows-сервера — MZ. Пакет включает все DLL из подготовленной папки, рассчитывает для них SHA-256 и подписывает их в манифесте.

Перед объявлением рабочей модель должна быть проверена настоящим запуском, а не только заголовком файла и подписью.

## Создание подписанного каталога после публикации пакета по HTTPS

После размещения готового большого файла на собственном доверенном HTTPS-хостинге:

```powershell
node scripts/sign-ai-catalog.js `
  --pack "C:\IR-AI-Publisher\qwen3-vl-4b-1.0.0.ir-ai-pack" `
  --url "https://models.example.com/qwen3-vl-4b-1.0.0.ir-ai-pack" `
  --key-file "C:\IR-AI-Publisher\keys\publisher-ed25519-private.pem" `
  --key-id "ir-ai-publisher-2026" `
  --expires-days 7 `
  --notes "Qwen3-VL 4B Q4_K_M, Windows x64, проверенная сборка" `
  --out "C:\IR-AI-Publisher\catalog.json"
```

Здесь `models.example.com` — **только пример**, в рабочей программе URL ещё не настроен. Каталог и пакет должны публиковаться **на одном HTTPS origin**; приложение откажется переходить на другой хост. Новый каталог необходимо перевыпускать до истечения срока годности.

## Что остаётся после 1.7.214

1. Зафиксировать точные версии/хэши официальных файлов и лицензии, скачать их в среду издателя.
2. Проверить подлинный Windows x64 CUDA/CPU `llama-server.exe` с GGUF и mmproj на Windows RTX 4050 / 16 ГБ RAM.
3. Официально создать безопасный Ed25519-ключ, встроить утверждённый публичный ключ и официальный URL в IR Project отдельным релизом.
4. Создать и опубликовать **настоящий** многогигабайтный `.ir-ai-pack` на подходящем хостинге; тестовый архив из CI не является нейросетью.
5. Подключить версионированный тест запуска перед активацией модели; затем PaddleOCR-VL 1.6 и очередь распознавания КМД.

## Ограничения приёмки

- GitHub Actions проверяет криптографию и потоковую упаковку **малых синтетических файлов с заголовками**. Никаких фактических весов нейросети там нет.
- Подписывание не равно инженерной точности распознавания.
- Не изменены основные объекты, существующие схемы 2D/3D, документы и SQLite.
- Перед публикацией рабочего пакета необходимо согласовать юридические условия распространения модели и CUDA/библиотек.
