document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // ANALYTICS SETUP
    // ============================================
    const analytics = new AnalyticsManager();
    const sessionName = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    analytics.initialize('crossword_si_unit', sessionName);
    
    let levelStartTime = 0;
    let currentLevelId = null;
    let checkAttempts = 0;
    let submitAttempts = 0;

    // DOM Elements
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesElement = document.getElementById('across-clues');
    const downCluesElement = document.getElementById('down-clues');
    const titleElement = document.getElementById('puzzle-title');
    const levelElement = document.getElementById('puzzle-level');
    const checkButton = document.getElementById('check-btn');
    const submitButton = document.getElementById('submit-btn');
    const successOverlay = document.getElementById('success-overlay');
    const timesUpOverlay = document.getElementById('times-up-overlay');
    const incompleteOverlay = document.getElementById('incomplete-overlay');
    const restartButton = document.getElementById('restart-btn');
    const homeButton = document.getElementById('home-btn');
    const incompleteOkButton = document.getElementById('incomplete-ok-btn');
    const timerElement = document.getElementById('timer');
    const scoreDisplayElement = document.getElementById('score-display');
    const adminPanel = document.getElementById('admin-panel');
    const gameContainer = document.querySelector('.game-container');

    // State Management
    let currentPuzzleData = null;
    let gridState;
    let currentDirection = 'across';
    let activeClueInfo = null;
    let lastFocusedCell = { row: -1, col: -1 };
    let timerInterval = null;
    let timeRemaining = 0;
    const GAME_DURATION = 600; // 10 minutes in seconds

    // --- GAME FLOW & INITIALIZATION ---

    async function startGame() {
        try {
            const response = await fetch('puzzle.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentPuzzleData = await response.json();
            initializeGame();
        } catch(error) {
            console.error("Failed to start game:", error);
            gridElement.innerHTML = `<p style="color: var(--error-color);">Could not load puzzle. Please check puzzle.json and refresh.</p>`;
        }
    }

    function initializeGame() {
        lastFocusedCell = { row: -1, col: -1 };
        currentDirection = 'across';
        timeRemaining = GAME_DURATION;
        
        try {
            const { metadata, clues } = currentPuzzleData;
            const { rows, cols } = metadata.size;
            titleElement.textContent = metadata.title;
            levelElement.textContent = 'Level 1';
            gridState = Array(rows).fill(null).map(() => Array(cols).fill(null));
            gridElement.style.setProperty('--grid-rows', rows);
            gridElement.style.setProperty('--grid-cols', cols);
            populateGridState(clues.across);
            populateGridState(clues.down);
            renderGrid(rows, cols);
            renderClues(clues.across, acrossCluesElement, 'across');
            renderClues(clues.down, downCluesElement, 'down');
            startTimer();
            
            // Analytics: Start level tracking
            currentLevelId = 'puzzle_' + metadata.title.toLowerCase().replace(/\s+/g, '_');
            analytics.startLevel(currentLevelId);
            levelStartTime = Date.now();
            checkAttempts = 0;
            submitAttempts = 0;
            
            // Track puzzle metadata
            analytics.addRawMetric('puzzle_title', metadata.title);
            analytics.addRawMetric('grid_size', `${rows}x${cols}`);
            analytics.addRawMetric('total_clues', clues.across.length + clues.down.length);
        } catch (error) {
            console.error("CRITICAL ERROR building puzzle:", error);
            gridElement.innerHTML = `<p style="color: var(--error-color);">A critical error occurred while building the puzzle.</p>`;
        }
    }
    
    // --- TIMER LOGIC ---

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);

        const updateDisplay = () => {
            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        updateDisplay();
        timerInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updateDisplay();
            } else {
                endGameByTimeUp();
            }
        }, 1000);
    }

    function endGameByTimeUp() {
        clearInterval(timerInterval);
        timerElement.textContent = "0:00";
        timesUpOverlay.classList.remove('hidden');
        document.querySelectorAll('.cell-input').forEach(input => { input.readOnly = true; });
        checkButton.disabled = true;
        submitButton.disabled = true;
        
        // Analytics: Track time-up event
        const timeTakenMs = GAME_DURATION * 1000;
        console.log('[Analytics] Time\'s up! Game ended.');
        
        analytics.addRawMetric('time_expired', 'true');
        analytics.endLevel(currentLevelId, false, timeTakenMs, 0);
        analytics.submitReport();
    }

    // --- GRID & CLUE RENDERING ---

    function populateGridState(clueList) {
        clueList.forEach(clue => {
            const answer = clue.answer.toUpperCase();
            for (let i = 0; i < answer.length; i++) {
                const r = clue.direction === 'across' ? clue.row : clue.row + i;
                const c = clue.direction === 'across' ? clue.col + i : clue.col;
                if (!gridState[r][c]) gridState[r][c] = { answer: '', words: [] };
                gridState[r][c].answer = answer[i];
                if (!gridState[r][c].words.some(w => w.number === clue.number && w.direction === clue.direction)) {
                    gridState[r][c].words.push({ number: clue.number, direction: clue.direction });
                }
                if (i === 0) gridState[r][c].clueNumber = clue.number;
            }
        });
    }

    function renderGrid(rows, cols) {
        gridElement.innerHTML = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellData = gridState[r][c];
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                
                const devCoords = document.createElement('div');
                devCoords.className = 'dev-coords';
                devCoords.textContent = `${r},${c}`;
                cell.appendChild(devCoords);

                if (!cellData) {
                    cell.classList.add('empty');
                } else {
                    const devAnswer = document.createElement('div');
                    devAnswer.className = 'dev-answer';
                    devAnswer.textContent = cellData.answer;
                    cell.appendChild(devAnswer);

                    if (cellData.clueNumber) {
                        const numDiv = document.createElement('div');
                        numDiv.className = 'clue-number';
                        numDiv.textContent = cellData.clueNumber;
                        cell.appendChild(numDiv);
                    }
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'cell-input';
                    input.dataset.answer = cellData.answer.toUpperCase();
                    input.addEventListener('input', handleCellInput);
                    input.addEventListener('focus', () => handleFocus(r, c));
                    input.addEventListener('keydown', handleKeyDown);
                    cell.appendChild(input);
                }
                gridElement.appendChild(cell);
            }
        }
    }

    function renderClues(clueList, listElement, direction) {
        listElement.innerHTML = '';
        clueList.forEach(clue => {
            const li = document.createElement('li');
            li.textContent = `${clue.number}. ${clue.clue}`;
            li.dataset.number = clue.number;
            li.dataset.direction = direction;
            li.addEventListener('click', handleClueClick);
            listElement.appendChild(li);
        });
    }

    // --- USER INPUT & INTERACTION ---

    function handleCellInput(e) {
        e.target.value = e.target.value.toUpperCase();
        if (e.target.value.length === 0 || !activeClueInfo) return;

        const { row: startRow, col: startCol, answer } = activeClueInfo;
        const currentCellPos = e.target.parentElement.dataset;
        let currentWordIndex = (currentDirection === 'across')
            ? parseInt(currentCellPos.col) - startCol
            : parseInt(currentCellPos.row) - startRow;
        
        if (currentWordIndex < answer.length - 1) {
            const nextIndex = currentWordIndex + 1;
            const r = (currentDirection === 'across') ? startRow : startRow + nextIndex;
            const c = (currentDirection === 'across') ? startCol + nextIndex : startCol;
            const nextCell = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] input`);
            if (nextCell && !nextCell.readOnly) nextCell.focus();
        }
    }

    function handleKeyDown(e) {
        const cell = e.target.parentElement;
        let { row, col } = cell.dataset;
        row = parseInt(row); col = parseInt(col);

        if (e.key === 'Backspace' && e.target.value === '') {
            e.preventDefault();
            const prevR = (currentDirection === 'down') ? row - 1 : row;
            const prevC = (currentDirection === 'across') ? col - 1 : col;
            const prevCell = document.querySelector(`.grid-cell[data-row="${prevR}"][data-col="${prevC}"] input`);
            if (prevCell) prevCell.focus();
            return;
        }

        let nextR = row, nextC = col;
        switch (e.key) {
            case 'ArrowUp': nextR--; break;
            case 'ArrowDown': nextR++; break;
            case 'ArrowLeft': nextC--; break;
            case 'ArrowRight': nextC++; break;
            default: return;
        }
        const nextCell = document.querySelector(`.grid-cell[data-row="${nextR}"][data-col="${nextC}"] input`);
        if (nextCell) {
            e.preventDefault();
            nextCell.focus();
        }
    }
    
    function handleFocus(row, col) {
        const cellData = gridState[row][col];
        if (!cellData) return;
        const hasAcross = cellData.words.some(w => w.direction === 'across');
        const hasDown = cellData.words.some(w => w.direction === 'down');
        
        if (lastFocusedCell.row === row && lastFocusedCell.col === col) {
            if (hasAcross && hasDown) currentDirection = currentDirection === 'across' ? 'down' : 'across';
        } else {
            const isCurrentDirectionValid = (currentDirection === 'across' && hasAcross) || (currentDirection === 'down' && hasDown);
            if (!isCurrentDirectionValid) currentDirection = hasAcross ? 'across' : 'down';
        }
        lastFocusedCell = { row, col };
        highlightWord(row, col, currentDirection);
    }

    function handleClueClick(e) {
        const { number, direction } = e.target.dataset;
        const clue = currentPuzzleData.clues[direction].find(c => c.number == number);
        if (clue) {
            currentDirection = direction;
            const firstCellInput = document.querySelector(`.grid-cell[data-row="${clue.row}"][data-col="${clue.col}"] input`);
            if (firstCellInput) firstCellInput.focus();
        }
    }

    function highlightWord(row, col, direction) {
        document.querySelectorAll('.focused-word, li.highlighted').forEach(el => el.classList.remove('highlighted', 'focused-word'));
        const cellData = gridState[row][col];
        if (!cellData) return;
        const wordInfo = cellData.words.find(w => w.direction === direction);
        if (!wordInfo) return;
        activeClueInfo = currentPuzzleData.clues[direction].find(c => c.number === wordInfo.number);
        if (!activeClueInfo) return;
        document.querySelector(`li[data-number="${activeClueInfo.number}"][data-direction="${direction}"]`)?.classList.add('highlighted');
        for (let i = 0; i < activeClueInfo.answer.length; i++) {
            const r = direction === 'across' ? activeClueInfo.row : activeClueInfo.row + i;
            const c = direction === 'across' ? activeClueInfo.col + i : activeClueInfo.col;
            document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`)?.classList.add('focused-word');
        }
    }

    // --- PUZZLE CHECKING & SUBMISSION ---

    function checkCompletion() {
        checkAttempts++;
        const inputs = [...document.querySelectorAll('.cell-input')];
        const totalCells = inputs.length;
        const filledCells = inputs.filter(input => input.value.trim() !== '').length;
        const emptyCells = totalCells - filledCells;
        const percentFilled = totalCells > 0 ? (filledCells / totalCells * 100).toFixed(1) : 0;
        
        const isComplete = inputs.every(input => input.value.trim() !== '');
        
        console.log('[Analytics] Check attempt #' + checkAttempts, {
            filled: filledCells,
            empty: emptyCells,
            total: totalCells,
            percentFilled: percentFilled + '%',
            complete: isComplete
        });
        
        // Record analytics task
        analytics.recordTask(
            currentLevelId,
            'check_attempt_' + checkAttempts,
            `Check Completion Attempt #${checkAttempts}`,
            'all_filled',
            isComplete ? 'all_filled' : 'has_empty',
            Date.now() - levelStartTime,
            0 // No XP for just checking
        );
        
        // Track metrics
        analytics.addRawMetric('check_attempts', checkAttempts);
        analytics.addRawMetric('percent_filled', percentFilled);
        analytics.addRawMetric('filled_cells', filledCells);
        analytics.addRawMetric('empty_cells', emptyCells);
        
        if (isComplete) {
            checkButton.classList.add('hidden');
            submitButton.classList.remove('hidden');
        } else {
            incompleteOverlay.classList.remove('hidden');
        }
    }

    function submitPuzzle() {
        submitAttempts++;
        const inputs = document.querySelectorAll('.cell-input');
        let correctCount = 0;
        let incorrectCount = 0;
        let allCorrect = true;
        
        inputs.forEach(input => {
            const enteredValue = input.value.toUpperCase();
            const correctValue = input.dataset.answer;
            if (enteredValue === correctValue) {
                input.classList.add('correct');
                correctCount++;
            } else {
                allCorrect = false;
                incorrectCount++;
                input.classList.add('incorrect-flash');
            }
        });
        
        const accuracy = inputs.length > 0 ? (correctCount / inputs.length * 100).toFixed(1) : 0;
        
        console.log('[Analytics] Submit attempt #' + submitAttempts, {
            correct: correctCount,
            incorrect: incorrectCount,
            accuracy: accuracy + '%',
            allCorrect: allCorrect
        });
        
        // Record submit attempt
        analytics.recordTask(
            currentLevelId,
            'submit_attempt_' + submitAttempts,
            `Submit Puzzle Attempt #${submitAttempts}`,
            'all_correct',
            allCorrect ? 'all_correct' : 'has_errors',
            Date.now() - levelStartTime,
            allCorrect ? 50 : 0
        );
        
        // Track metrics
        analytics.addRawMetric('submit_attempts', submitAttempts);
        analytics.addRawMetric('final_accuracy', accuracy);
        analytics.addRawMetric('correct_cells', correctCount);
        analytics.addRawMetric('incorrect_cells', incorrectCount);

        if (allCorrect) {
            clearInterval(timerInterval);
            const timeTakenSeconds = GAME_DURATION - timeRemaining;
            const timeTakenMs = timeTakenSeconds * 1000;
            let finalScore = 50; // Default score
            if (timeTakenSeconds <= 240) { // less than 4 mins
                finalScore = 200;
            } else if (timeTakenSeconds <= 360) { // less than 6 mins
                finalScore = 150;
            } else if (timeTakenSeconds <= 480) { // less than 8 mins
                finalScore = 100;
            }
            
            console.log('[Analytics] Puzzle completed!', {
                timeTaken: timeTakenSeconds + 's',
                finalScore: finalScore,
                checkAttempts: checkAttempts,
                submitAttempts: submitAttempts
            });
            
            // Track completion metrics
            analytics.addRawMetric('time_taken_seconds', timeTakenSeconds);
            analytics.addRawMetric('final_score', finalScore);
            
            // End level tracking
            analytics.endLevel(currentLevelId, true, timeTakenMs, finalScore);
            
            // Log full report before submission
            console.log('[Analytics] Full Report:', analytics.getReportData());
            
            // Submit the report
            analytics.submitReport();
            
            scoreDisplayElement.textContent = finalScore;
            inputs.forEach(input => input.readOnly = true);
            successOverlay.classList.remove('hidden');
        } else {
            setTimeout(() => {
                inputs.forEach(input => {
                    input.classList.remove('incorrect-flash');
                    if (input.classList.contains('correct')) {
                        input.readOnly = true;
                    }
                });
            }, 2000); // Remove flash after 2 seconds
        }
    }

    // --- SECRET CODES & EVENT LISTENERS ---

    let keySequence = "";
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.key.length > 1) return;
        keySequence += (e.key === '`' || e.key === '~') ? '~' : e.key.toLowerCase();
        
        const codes = {
            "~asd": () => adminPanel.classList.toggle('hidden'),
            "~adev": () => gameContainer.classList.add('dev-mode', 'dev-answers-mode'),
            "~dev": () => {
                gameContainer.classList.toggle('dev-mode');
                gameContainer.classList.remove('dev-answers-mode');
            },
            "~sdev": () => gameContainer.classList.remove('dev-mode', 'dev-answers-mode')
        };

        for (const code in codes) {
            if (keySequence.endsWith(code)) {
                codes[code]();
                keySequence = "";
                return;
            }
        }
        if (keySequence.length > 5) keySequence = keySequence.slice(-5);
    });

    checkButton.addEventListener('click', checkCompletion);
    submitButton.addEventListener('click', submitPuzzle);
    restartButton.addEventListener('click', () => location.reload());
    homeButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    incompleteOkButton.addEventListener('click', () => incompleteOverlay.classList.add('hidden'));
    
    // Analytics: Track incomplete sessions (user leaves before completing)
    window.addEventListener('beforeunload', () => {
        if (currentLevelId && levelStartTime > 0) {
            const level = analytics._getLevelById(currentLevelId);
            if (level && !level.successful) {
                const timeTaken = Date.now() - levelStartTime;
                console.log('[Analytics] Session ended (incomplete)');
                analytics.addRawMetric('session_incomplete', 'true');
                analytics.endLevel(currentLevelId, false, timeTaken, 0);
                analytics.submitReport();
            }
        }
    });
    
    // Start Game
    startGame();
});