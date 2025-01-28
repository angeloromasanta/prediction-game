import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { questions } from './questions';

// Initialize/Reset Game State
const initializeGameState = async () => {
  try {
    await setDoc(doc(db, 'gameStates', 'current'), {
      phase: 'registration',
      currentQuestion: 1,
    });

    const studentsSnapshot = await getDocs(collection(db, 'students'));
    const deletePromises = studentsSnapshot.docs.map((doc) =>
      deleteDoc(doc.ref)
    );
    await Promise.all(deletePromises);

    console.log('Game state initialized successfully');
  } catch (error) {
    console.error('Error initializing game state:', error);
  }
};

// Combined Student Component (Registration + Question)
const Student = () => {
  const [name, setName] = useState('');
  const [prediction, setPrediction] = useState(50);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [gamePhase, setGamePhase] = useState('registration');
  const [studentId, setStudentId] = useState(null);
  const [studentData, setStudentData] = useState(null);

  // Check for valid student session on component mount
  useEffect(() => {
    const validateStudent = async () => {
      const savedId = localStorage.getItem('studentId');
      if (savedId) {
        // Verify the student exists and is valid
        const studentDoc = await getDocs(
          query(collection(db, 'students'), where('__name__', '==', savedId))
        );

        if (studentDoc.empty) {
          // Invalid or old student ID, clear it
          localStorage.removeItem('studentId');
          setStudentId(null);
        } else {
          setStudentId(savedId);
        }
      }
    };
    validateStudent();
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let gameStateUnsubscribe = () => {};

    if (studentId) {
      // Set up real-time listener for student data
      unsubscribe = onSnapshot(doc(db, 'students', studentId), (doc) => {
        if (doc.exists()) {
          setStudentData(doc.data());
          setSubmitted(doc.data().submitted || false);
        } else {
          localStorage.removeItem('studentId');
          setStudentId(null);
          unsubscribe();
          gameStateUnsubscribe();
        }
      });

      // Set up real-time listener for game state
      gameStateUnsubscribe = onSnapshot(
        doc(db, 'gameStates', 'current'),
        (doc) => {
          const gameState = doc.data();
          if (gameState) {
            setGamePhase(gameState.phase);
            if (gameState.phase === 'question') {
              setCurrentQuestion(questions[gameState.currentQuestion - 1]);
              setSubmitted(false);
            }
          }
        }
      );

      return () => {
        unsubscribe();
        gameStateUnsubscribe();
      };
    }
  }, [studentId]);

  const handleRegistration = async (e) => {
    e.preventDefault();

    try {
      const studentsSnapshot = await getDocs(
        query(collection(db, 'students'), where('name', '==', name))
      );

      if (!studentsSnapshot.empty) {
        alert('This name is already taken. Please choose a different name.');
        return;
      }

      const gameStateSnapshot = await getDocs(collection(db, 'gameStates'));
      const gameState = gameStateSnapshot.docs[0]?.data();

      if (gameState && gameState.phase !== 'registration') {
        alert('Registration is currently closed.');
        return;
      }

      const docRef = await addDoc(collection(db, 'students'), {
        name,
        currentScore: 0,
        totalScore: 0,
        submitted: false,
      });

      localStorage.setItem('studentId', docRef.id);
      setStudentId(docRef.id);
    } catch (error) {
      console.error('Error registering student:', error);
      alert('Error registering. Please try again.');
    }
  };

  const handleSubmission = async () => {
    try {
      await updateDoc(doc(db, 'students', studentId), {
        prediction: Number(prediction),
        submitted: true,
      });
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Error submitting answer. Please try again.');
    }
  };

  if (!studentId) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-4">Register for Quiz</h2>
        <form onSubmit={handleRegistration} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full p-2 border rounded"
            required
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Submit
          </button>
        </form>
      </div>
    );
  }

  if (gamePhase === 'registration') {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">
          Welcome, {studentData?.name}!
        </h2>
        <p className="text-lg mb-4">You're registered for the quiz.</p>
        <p className="text-lg">
          Please wait for the admin to start the first question...
        </p>
        <div className="mt-8 animate-pulse">
          <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg">Loading question...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">{currentQuestion.question}</h2>
      <input
        type="range"
        min="0"
        max="100"
        value={prediction}
        onChange={(e) => setPrediction(parseInt(e.target.value))}
        className="w-full mb-4"
        disabled={submitted}
      />
      <div className="text-center mb-4">Value: {prediction}%</div>
      <button
        onClick={handleSubmission}
        disabled={submitted}
        className={`w-full py-2 rounded ${
          submitted ? 'bg-green-500' : 'bg-blue-500'
        } text-white`}
      >
        {submitted ? 'Answer Submitted' : 'Submit Answer'}
      </button>
    </div>
  );
};

// Admin Component
const Admin = () => {
  const [gamePhase, setGamePhase] = useState('registration');
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const setupGame = async () => {
      // Check if game state exists, if not initialize it
      const gameStateDoc = await getDocs(collection(db, 'gameStates'));
      if (gameStateDoc.empty) {
        await initializeGameState();
      }

      // Set up real-time listeners
      const gameStateUnsubscribe = onSnapshot(
        doc(db, 'gameStates', 'current'),
        (doc) => {
          const gameData = doc.data();
          if (gameData) {
            setGamePhase(gameData.phase);
            setCurrentQuestion(gameData.currentQuestion);
          }
        }
      );

      const studentsUnsubscribe = onSnapshot(
        collection(db, 'students'),
        (snapshot) => {
          setStudents(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
          );
        }
      );

      return () => {
        gameStateUnsubscribe();
        studentsUnsubscribe();
      };
    };

    setupGame();
  }, []);

  const startQuestion = async () => {
    await updateDoc(doc(db, 'gameStates', 'current'), {
      phase: 'question',
      currentQuestion,
    });
  };

  // In the showResults function within Admin component, modify to store prediction differences:
const showResults = async () => {
  const currentQuestionData = questions[currentQuestion - 1];
  const updatedStudents = students.map((student) => {
    const prediction = Number(student.prediction) || 0;
    const currentScore = Math.abs(currentQuestionData.answer - prediction);
    const predictionDiff = prediction - currentQuestionData.answer; // Calculate difference
    
    // Get existing differences array or initialize new one
    const existingDiffs = student.predictionDiffs || [];
    const newDiffs = [...existingDiffs, predictionDiff];
    
    return {
      ...student,
      currentScore,
      totalScore: (student.totalScore || 0) + currentScore,
      predictionDiffs: newDiffs // Store the differences array
    };
  });

  await Promise.all(
    updatedStudents.map((student) =>
      updateDoc(doc(db, 'students', student.id), {
        currentScore: student.currentScore,
        totalScore: student.totalScore,
        predictionDiffs: student.predictionDiffs
      })
    )
  );

  await updateDoc(doc(db, 'gameStates', 'current'), {
    phase: 'results',
  });
};

  const nextQuestion = async () => {
    if (currentQuestion < questions.length) {
      const nextQuestionNum = currentQuestion + 1;
      await updateDoc(doc(db, 'gameStates', 'current'), {
        phase: 'question',
        currentQuestion: nextQuestionNum,
      });

      // Reset student submissions
      await Promise.all(
        students.map((student) =>
          updateDoc(doc(db, 'students', student.id), {
            submitted: false,
          })
        )
      );
    } else {
      await updateDoc(doc(db, 'gameStates', 'current'), {
        phase: 'final',
      });
    }
  };

  const resetGame = async () => {
    try {
      await initializeGameState();
    } catch (error) {
      console.error('Error resetting game:', error);
    }
  };

  const renderStudentList = () => {
    const sortedStudents = [...students].sort((a, b) => {
      if (gamePhase === 'results' || gamePhase === 'final') {
        return Math.abs(a.currentScore || 0) - Math.abs(b.currentScore || 0);
      }
      return Math.abs(a.totalScore || 0) - Math.abs(b.totalScore || 0);
    });
  
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Score</th>
              {(gamePhase === 'results' || gamePhase === 'final') && (
                <>
                  <th className="px-4 py-2">Total Score</th>
                  <th className="px-4 py-2">All Predictions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => (
              <tr
                key={student.id}
                className={student.submitted ? 'bg-green-100' : ''}
              >
                <td className="border px-4 py-2">{student.name}</td>
                <td className="border px-4 py-2">
                  {gamePhase === 'results' || gamePhase === 'final'
                    ? student.currentScore || 0
                    : student.totalScore || 0}
                </td>
                {(gamePhase === 'results' || gamePhase === 'final') && (
                  <>
                    <td className="border px-4 py-2">
                      {student.totalScore || 0}
                    </td>
                    <td className="border px-4 py-2">
                      {student.predictionDiffs ? 
                        student.predictionDiffs
                          .sort((a, b) => a - b) // Sort from most negative to most positive
                          .map(diff => (
                            diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`
                          ))
                          .join(', ')
                        : ''}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <button
          onClick={resetGame}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Reset Game
        </button>
      </div>

      {gamePhase === 'registration' && (
        <div>
          <h2 className="text-xl mb-4">Registered Students</h2>
          {renderStudentList()}
          <button
            onClick={startQuestion}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
            disabled={students.length === 0}
          >
            Start Question {currentQuestion}
          </button>
        </div>
      )}

      {gamePhase === 'question' && (
        <div>
          <h2 className="text-xl mb-4">Current Question</h2>
          <p className="mb-4">{questions[currentQuestion - 1].question}</p>
          {renderStudentList()}
          <button
            onClick={showResults}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
          >
            Show Results
          </button>
        </div>
      )}

      {gamePhase === 'results' && (
        <div>
          <h2 className="text-xl mb-4">Results</h2>
          <p className="mb-4">
            Correct Answer: {questions[currentQuestion - 1].answer}%
          </p>
          {renderStudentList()}
          <button
            onClick={nextQuestion}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
          >
            {currentQuestion < questions.length
              ? 'Next Question'
              : 'Show Final Results'}
          </button>
        </div>
      )}

      {gamePhase === 'final' && (
        <div>
          <h2 className="text-xl mb-4">Final Results</h2>
          {renderStudentList()}
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Student />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
