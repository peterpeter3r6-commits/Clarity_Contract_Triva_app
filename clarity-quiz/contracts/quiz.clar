;; Clarity Quiz smart contract
;; This contract demonstrates beginner-to-advanced Clarity concepts via a quiz system

(define-constant ERR_UNAUTHORIZED u100)
(define-constant ERR_QUESTION_NOT_FOUND u101)
(define-constant ERR_ALREADY_ANSWERED u102)
(define-constant ERR_INVALID_ANSWER_INDEX u103)

(define-constant REWARD_AMOUNT u1000) ;; 1000 micro-STX per correct answer when pool allows

(define-data-var admin (optional principal) none)
(define-data-var next-question-id uint u0)
(define-data-var reward-pool uint u0)

;; Stores quiz questions by numeric id
(define-map questions
  { id: uint }
  { prompt: (string-ascii 200),
    answers: (list 4 (string-ascii 64)),
    correct-index: uint,
    difficulty: (string-ascii 12)
  })

;; Per-user aggregate statistics
(define-map user-stats
  { user: principal }
  { score: uint,
    questions-answered: uint
  })

;; Per-user per-question answer history
(define-map user-answers
  { user: principal, question-id: uint }
  { is-correct: bool })

;; ---------- Helpers ----------

(define-private (is-admin (who principal))
  (match (var-get admin) current-admin
    (is-eq who current-admin)
    false))

(define-private (generate-question-id)
  (let ((id (var-get next-question-id)))
    (begin
      (var-set next-question-id (+ id u1))
      id)))

(define-private (update-user-stats (user principal) (is-correct bool))
  (let ((existing (map-get? user-stats { user: user })))
    (match existing stats
      (let ((old-score (get score stats))
            (old-answered (get questions-answered stats)))
        (map-set user-stats
          { user: user }
          { score: (if is-correct (+ old-score u1) old-score),
            questions-answered: (+ old-answered u1) })
        true)
      (begin
        (map-set user-stats
          { user: user }
          { score: (if is-correct u1 u0),
            questions-answered: u1 })
        true))))

(define-private (distribute-reward (recipient principal))
  (let ((pool (var-get reward-pool)))
    (if (>= REWARD_AMOUNT pool)
        ;; Not enough balance in the accounting variable; do nothing
        false
        (let ((result (stx-transfer? REWARD_AMOUNT (as-contract tx-sender) recipient)))
          (match result ok-result
            (begin
              (var-set reward-pool (- pool REWARD_AMOUNT))
              true)
            err-code
            false)))))

;; ---------- Admin functions ----------

(define-public (set-admin (new-admin principal))
  (let ((maybe-admin (var-get admin)))
    (if (is-none maybe-admin)
        ;; First call: bootstrap admin without restriction
        (begin
          (var-set admin (some new-admin))
          (ok new-admin))
        ;; Subsequent calls: only current admin may update
        (match maybe-admin current-admin
          (if (is-eq tx-sender current-admin)
              (begin
                (var-set admin (some new-admin))
                (ok new-admin))
              (err ERR_UNAUTHORIZED))
          (err ERR_UNAUTHORIZED)))))

(define-public (add-question
    (prompt (string-ascii 200))
    (answers (list 4 (string-ascii 64)))
    (correct-index uint)
    (difficulty (string-ascii 12)))
  (if (not (is-admin tx-sender))
      (err ERR_UNAUTHORIZED)
      (if (>= correct-index (len answers))
          (err ERR_INVALID_ANSWER_INDEX)
          (let ((id (generate-question-id)))
            (begin
              (map-set questions
                { id: id }
                { prompt: prompt,
                  answers: answers,
                  correct-index: correct-index,
                  difficulty: difficulty })
              (ok id))))))

(define-public (update-question
    (id uint)
    (prompt (string-ascii 200))
    (answers (list 4 (string-ascii 64)))
    (correct-index uint)
    (difficulty (string-ascii 12)))
  (if (not (is-admin tx-sender))
      (err ERR_UNAUTHORIZED)
      (if (>= correct-index (len answers))
          (err ERR_INVALID_ANSWER_INDEX)
          (match (map-get? questions { id: id }) existing
            (begin
              (map-set questions
                { id: id }
                { prompt: prompt,
                  answers: answers,
                  correct-index: correct-index,
                  difficulty: difficulty })
              (ok true))
            (err ERR_QUESTION_NOT_FOUND)))))

(define-public (fund-reward-pool (amount uint))
  (begin
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (var-set reward-pool (+ (var-get reward-pool) amount))
    (ok (var-get reward-pool))))

;; ---------- User functions ----------

(define-public (answer-question (id uint) (selected-index uint))
  (match (map-get? questions { id: id }) question
    (begin
      (if (>= selected-index (len (get answers question)))
          (err ERR_INVALID_ANSWER_INDEX)
          (if (is-some (map-get? user-answers { user: tx-sender, question-id: id }))
              (err ERR_ALREADY_ANSWERED)
              (let ((correct-index (get correct-index question))
                    (is-correct (is-eq selected-index correct-index)))
                (begin
                  (map-set user-answers
                    { user: tx-sender, question-id: id }
                    { is-correct: is-correct })
                  (update-user-stats tx-sender is-correct)
                  (if is-correct
                      (let ((reward-paid (distribute-reward tx-sender)))
                        (ok { is-correct: true, reward-paid: reward-paid }))
                      (ok { is-correct: false, reward-paid: false })))))))
    (err ERR_QUESTION_NOT_FOUND)))

;; ---------- Read-only helpers ----------

(define-read-only (get-question (id uint))
  (match (map-get? questions { id: id }) question
    (ok {
      id: id,
      prompt: (get prompt question),
      answers: (get answers question),
      difficulty: (get difficulty question)
    })
    (err ERR_QUESTION_NOT_FOUND)))

(define-read-only (get-user-stats (user principal))
  (match (map-get? user-stats { user: user }) stats
    (ok stats)
    (ok { score: u0, questions-answered: u0 })))

(define-read-only (get-reward-pool)
  (ok (var-get reward-pool)))
