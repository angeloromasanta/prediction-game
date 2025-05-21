// src/components/AdminPanel.jsx
import { useState, useEffect } from 'react';
import { db } from './firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { questions } from './questions';

export default function AdminPanel() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [students, setStudents] = useState([]);
  const [gameState, setGameState] = useState('waiting'); // waiting, in_progress, completed

  useEffect(() => {
    const initializeGame = async () => {
      // Initialize gameState document if it doesn't exist
      const gameStateRef = doc(db, 'gameState', 'current');
      const gameStateDoc = await getDoc(gameStateRef);

      if (!gameStateDoc.exists()) {
        await setDoc(gameStateRef, {
          currentQuestion: 0,
          status: 'waiting',
        });
      }
    };

    const fetchStudents = async () => {
      const snapshot = await getDocs(collection(db, 'students'));
      setStudents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };

    initializeGame();
    fetchStudents();

    // Set up real-time listener for students
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, []);

  const handleNextQuestion = async () => {
    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion((prev) => prev + 1);
      await updateGameState(currentQuestion + 1);
    } else {
      setGameState('completed');
    }
  };

  const resetGame = async () => {
    try {
      // First update game state to waiting
      const gameStateRef = doc(db, 'gameState', 'current');
      await setDoc(gameStateRef, {
        currentQuestion: 0,
        status: 'waiting',
      });

      // Then clear all students
      const studentRefs = await getDocs(collection(db, 'students'));
      const deletePromises = studentRefs.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Update local state
      setCurrentQuestion(0);
      setGameState('waiting');
      setStudents([]);
    } catch (error) {
      console.error('Error resetting game:', error);
    }
  };

  const updateGameState = async (questionIndex) => {
    const gameStateRef = doc(db, 'gameState', 'current');
    try {
      await updateDoc(gameStateRef, {
        currentQuestion: questionIndex,
        status: 'in_progress',
      });
    } catch (error) {
      // If document doesn't exist, create it
      if (error.code === 'not-found') {
        await setDoc(gameStateRef, {
          currentQuestion: questionIndex,
          status: 'in_progress',
        });
      } else {
        console.error('Error updating game state:', error);
      }
    }
  };

  const calculateRoundDifferences = () => {
    return students
      .map((student) => ({
        name: student.name,
        difference: student.answers[currentQuestion]
          ? student.answers[currentQuestion] - questions[currentQuestion].answer
          : null,
        cumulativeScore: student.cumulativeScore || 0,
      }))
      .filter((student) => student.difference !== null)
      .sort((a, b) => b.difference - a.difference);
  };

  const roundDifferences = calculateRoundDifferences();

  return (
    <div className="p-8">
      <div className="flex justify-between mb-8">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <button
          onClick={resetGame}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Reset Game
        </button>
      </div>

      {/* Question Display */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">
          Current Question ({currentQuestion + 1}/{questions.length})
        </h2>
        <p>{questions[currentQuestion].question}</p>
        <p>Correct Answer: {questions[currentQuestion].answer}%</p>
        <button
          onClick={handleNextQuestion}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          disabled={gameState === 'completed'}
        >
          Next Question
        </button>
      </div>

      {/* Round Results */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Current Round Results</h3>
        <div className="space-y-2">
          {roundDifferences.map(({ name, difference, cumulativeScore }) => (
            <div key={name} className="flex justify-between p-2 bg-gray-50">
              <span>{name}</span>
              <span
                className={difference > 0 ? 'text-red-500' : 'text-green-500'}
              >
                {difference > 0 ? '+' : ''}
                {difference}%
              </span>
              <span>Total: {cumulativeScore}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Overall Leader */}
      {gameState === 'completed' && (
        <div className="p-4 bg-green-100 rounded">
          <h3 className="text-lg font-semibold mb-2">Winner</h3>
          {students
            .sort((a, b) => (a.cumulativeScore || 0) - (b.cumulativeScore || 0))
            .slice(0, 1)
            .map((student) => (
              <div key={student.id}>
                {student.name} - Total Difference:{' '}
                {student.cumulativeScore}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
