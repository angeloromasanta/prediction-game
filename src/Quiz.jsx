// src/components/Quiz.jsx
import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { questions } from './questions';

export default function Quiz() {
  const [name, setName] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [prediction, setPrediction] = useState(50);
  const [gameState, setGameState] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [studentId, setStudentId] = useState(localStorage.getItem('studentId'));

  useEffect(() => {
    if (!studentId) return;

    // Listen for game state changes
    const unsubscribeGame = onSnapshot(
      doc(db, 'gameState', 'current'),
      (doc) => {
        if (doc.exists()) {
          const newGameState = doc.data();
          const previousQuestion = currentQuestion;

          // If question changed, reset the round result and prediction
          if (newGameState.currentQuestion !== currentQuestion) {
            setRoundResult(null);
            setPrediction(50);
          }

          setGameState(newGameState);
          setCurrentQuestion(newGameState.currentQuestion || 0);

          // Only clear storage if it's a game reset (going back to question 0 from a higher number)
          if (newGameState.status === 'waiting' && previousQuestion > 0) {
            localStorage.removeItem('studentId');
            localStorage.removeItem('studentName');
            setStudentId(null);
            setRoundResult(null);
            setPrediction(50);
            setName('');
          }
        }
      }
    );

    // Listen for student's own data
    const unsubscribeStudent = onSnapshot(
      doc(db, 'students', studentId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.answers && data.answers[currentQuestion]) {
            setRoundResult({
              prediction: data.answers[currentQuestion],
              actual: questions[currentQuestion].answer,
              difference:
                data.answers[currentQuestion] -
                questions[currentQuestion].answer,
            });
          }
        }
      }
    );

    return () => {
      unsubscribeGame();
      unsubscribeStudent();
    };
  }, [studentId, currentQuestion]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const newStudentId = Date.now().toString();
      const studentRef = doc(db, 'students', newStudentId);

      await setDoc(studentRef, {
        name: name.trim(),
        answers: {},
        cumulativeScore: 0,
        timestamp: new Date().toISOString(),
      });

      localStorage.setItem('studentId', newStudentId);
      localStorage.setItem('studentName', name.trim());
      setStudentId(newStudentId);
    } catch (error) {
      console.error('Error logging in:', error);
    }
  };

  const handleSubmit = async () => {
    if (!studentId) return;

    try {
      const studentRef = doc(db, 'students', studentId);

      // First verify the student document exists
      const studentDoc = await getDoc(studentRef);

      if (!studentDoc.exists()) {
        // If student doesn't exist, clear localStorage and reset state
        localStorage.removeItem('studentId');
        localStorage.removeItem('studentName');
        setStudentId(null);
        setRoundResult(null);
        setPrediction(50);
        setName('');
        return;
      }

      const difference = prediction - questions[currentQuestion].answer;

      await updateDoc(studentRef, {
        [`answers.${currentQuestion}`]: prediction,
        cumulativeScore: Math.abs(difference),
      });
    } catch (error) {
      console.error('Error submitting answer:', error);
      // If there's an error, clear localStorage and reset state
      localStorage.removeItem('studentId');
      localStorage.removeItem('studentName');
      setStudentId(null);
      setRoundResult(null);
      setPrediction(50);
      setName('');
    }
  };
  // Show login form if not logged in
  if (!studentId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md w-full max-w-md p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Join the Quiz</h1>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded mb-4"
              placeholder="Enter your name"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
            >
              Start Quiz
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Question Screen
  if (!roundResult) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700">
                Question {currentQuestion + 1} of {questions.length}
              </h2>
              <span className="text-blue-600 font-medium">
                {localStorage.getItem('studentName')}
              </span>
            </div>
            <p className="text-xl text-gray-800">
              {questions[currentQuestion].question}
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm text-gray-500 mb-2">
                <span>Very Unlikely</span>
                <span>Very Likely</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={prediction}
                onChange={(e) => setPrediction(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-center mt-2">
                <span className="text-2xl font-bold text-blue-600">
                  {prediction}%
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 font-medium"
            >
              Submit Prediction
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Round Result Screen
  if (roundResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md w-full max-w-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Round Result</h2>
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Your prediction</p>
              <p className="text-2xl font-bold">{roundResult.prediction}%</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Actual answer</p>
              <p className="text-2xl font-bold">{roundResult.actual}%</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Difference</p>
              <p
                className={`text-2xl font-bold ${
                  roundResult.difference > 0 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                {roundResult.difference > 0 ? '+' : ''}
                {roundResult.difference.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-center text-gray-600">
            Waiting for next question...
          </p>
        </div>
      </div>
    );
  }
}
