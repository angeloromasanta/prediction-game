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
  getDoc
} from 'firebase/firestore';
import { questions } from './questions';

// Initialize/Reset Game State
const initializeGameState = async () => {
  try {
    // Ensure the 'current' document exists and set initial phase
    await setDoc(doc(db, 'gameStates', 'current'), {
      phase: 'registration',
      currentQuestion: 1,
    });

    // Clear all existing student data
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
          // Invalid or old student ID (e.g., admin reset), clear it
          localStorage.removeItem('studentId');
          setStudentId(null);
        } else {
          setStudentId(savedId);
          // Fetch initial student data immediately
          setStudentData(studentDoc.docs[0].data());
          setSubmitted(studentDoc.docs[0].data().submitted || false);
        }
      }
    };
    validateStudent();
  }, []);

  useEffect(() => {
    let unsubscribeStudent = () => {};
    let unsubscribeGameState = () => {};

    if (studentId) {
      // Set up real-time listener for student data
      unsubscribeStudent = onSnapshot(doc(db, 'students', studentId), (docSnap) => {
        if (docSnap.exists()) {
          setStudentData(docSnap.data());
          setSubmitted(docSnap.data().submitted || false);
        } else {
          // Student document no longer exists (e.g., admin reset)
          localStorage.removeItem('studentId');
          setStudentId(null);
          setName(''); // Clear name to prompt re-registration
          // Ensure we also clean up game state listener if student is gone
          if (unsubscribeGameState) unsubscribeGameState();
          if (unsubscribeStudent) unsubscribeStudent();
        }
      });

      // Set up real-time listener for game state
      unsubscribeGameState = onSnapshot(
        doc(db, 'gameStates', 'current'),
        (docSnap) => {
          const gameState = docSnap.data();
          if (gameState) {
            setGamePhase(gameState.phase);
            if (gameState.phase === 'question') {
              setCurrentQuestion(questions[gameState.currentQuestion - 1]);
              // Reset submitted status when a new question starts
              setSubmitted(false);
            }
          }
        },
        (error) => {
          console.error("Error listening to game state:", error);
          // Handle case where gameStates/current doc might be missing temporarily
          // For now, it will just re-initialize in Admin if missing
        }
      );

      return () => {
        unsubscribeStudent();
        unsubscribeGameState();
      };
    }
  }, [studentId]);

  const handleRegistration = async (e) => {
    e.preventDefault();

    try {
      const studentsSnapshot = await getDocs(
        query(collection(db, 'students'), where('name', '==', name.trim())) // Trim name to avoid whitespace issues
      );

      if (!studentsSnapshot.empty) {
        alert('This name is already taken. Please choose a different name.');
        return;
      }

      const gameStateDoc = await getDocs(collection(db, 'gameStates')); // Get current game state
      const gameState = gameStateDoc.docs[0]?.data();

      if (gameState && gameState.phase !== 'registration') {
        alert('Registration is currently closed. Please wait for the next game.');
        return;
      }

      const docRef = await addDoc(collection(db, 'students'), {
        name: name.trim(), // Trim name before saving
        currentScore: 0,
        totalScore: 0,
        submitted: false,
        answers: {}, // Store individual answers (e.g., answers: { "0": 50, "1": 75 })
        predictionDiffs: [], // Store prediction differences for display
      });

      localStorage.setItem('studentId', docRef.id);
      setStudentId(docRef.id);
      setStudentData({
        name: name.trim(),
        currentScore: 0,
        totalScore: 0,
        submitted: false,
        answers: {},
        predictionDiffs: [],
      });
    } catch (error) {
      console.error('Error registering student:', error);
      alert('Error registering. Please try again.');
    }
  };

  const handleSubmission = async () => {
    if (!studentId || !currentQuestion) return;

    try {
      // Fetch the latest student data to ensure we have up-to-date answers object
      const studentDocRef = doc(db, 'students', studentId);
      const studentDoc = await getDoc(studentDocRef);
      const existingStudentData = studentDoc.data();

      const updatedAnswers = {
        ...existingStudentData.answers,
        [currentQuestion.id]: Number(prediction), // Use question.id as key for answer
      };

      await updateDoc(studentDocRef, {
        prediction: Number(prediction), // This `prediction` field seems redundant if `answers` is stored
        submitted: true,
        answers: updatedAnswers,
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
            autoFocus
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-200"
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
        <div className="mt-8">
          <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (gamePhase === 'final') {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
        <p className="text-lg">Thanks for playing, {studentData?.name}!</p>
        <p className="text-xl font-semibold mt-4">Your total score: {studentData?.totalScore || 'N/A'}</p>
        <p className="text-md text-gray-600 mt-2">
          (Lower total score is better)
        </p>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg">Loading question...</p>
        <div className="mt-8">
          <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  const questionIndex = questions.findIndex(q => q.id === currentQuestion.id);
  const isQuestionAnswered = studentData?.answers?.[currentQuestion.id] !== undefined;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Question {questionIndex + 1}: {currentQuestion.question}</h2>
      <input
        type="range"
        min="0"
        max="100"
        value={isQuestionAnswered ? studentData.answers[currentQuestion.id] : prediction}
        onChange={(e) => setPrediction(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg dark:bg-gray-700"
        disabled={submitted || gamePhase !== 'question'}
      />
      <div className="text-center mb-4 text-xl font-semibold">Value: {isQuestionAnswered ? studentData.answers[currentQuestion.id] : prediction}%</div>
      <button
        onClick={handleSubmission}
        disabled={submitted || gamePhase !== 'question'}
        className={`w-full py-3 rounded text-white font-bold text-lg ${
          submitted || gamePhase !== 'question' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
        } transition duration-200`}
      >
        {submitted ? 'Answer Submitted' : 'Submit Answer'}
      </button>
      {gamePhase === 'results' && (
        <div className="mt-4 p-4 bg-yellow-100 rounded text-center">
          <p className="font-semibold">Results are being shown! Please wait for the next question.</p>
          <p>Correct Answer: {currentQuestion.answer}%</p>
        </div>
      )}
    </div>
  );
};

// Helper function to render the histogram
// You can place this function definition in your Admin.js file,
// for example, above the Admin component definition, or as a nested helper.

const renderResponseHistogram = (studentPredictions, correctAnswerValue) => {
  if (!studentPredictions || studentPredictions.length === 0) {
    return <p className="text-center text-gray-500 my-4">No student predictions available for this question to display histogram.</p>;
  }

  const binLabels = [
    "0-9", "10-19", "20-29", "30-39", "40-49",
    "50-59", "60-69", "70-79", "80-89", "90-100"
  ];
  // Initialize bins: an array of objects, each representing a bin
  const bins = binLabels.map(label => ({
    label: label,
    count: 0,
    isCorrectBin: false
  }));

  // Populate bin counts
  studentPredictions.forEach(prediction => {
    let binIndex;
    if (typeof prediction !== 'number' || isNaN(prediction)) {
        return; // Skip non-numeric or NaN predictions
    }
    if (prediction === 100) {
      binIndex = 9; // Prediction of 100 goes into the last bin (90-100)
    } else if (prediction >= 0 && prediction < 100) {
      binIndex = Math.floor(prediction / 10);
    } else {
      return; // Skip out-of-range predictions (e.g., < 0)
    }
    if (bins[binIndex]) { // Ensure binIndex is valid
        bins[binIndex].count++;
    }
  });

  // Identify the correct bin
  let correctBinIndex;
  if (correctAnswerValue === 100) {
    correctBinIndex = 9;
  } else if (correctAnswerValue >= 0 && correctAnswerValue < 100) {
    correctBinIndex = Math.floor(correctAnswerValue / 10);
  }

  if (correctBinIndex !== undefined && bins[correctBinIndex]) {
    bins[correctBinIndex].isCorrectBin = true;
  }

  const maxCount = Math.max(...bins.map(b => b.count), 1); // Max count for scaling bar height, at least 1 to avoid division by zero

  return (
    <div className="mt-8 p-4 border rounded-lg bg-gray-50 shadow">
      <h3 className="text-lg font-semibold mb-4 text-center text-gray-700">Response Distribution for Question { /* Consider passing question number if needed */}</h3>
      <div className="flex justify-between h-48 space-x-1 px-2">  {/* Increased height for bars */}
        {bins.map((bin, index) => (
          <div key={index} className="flex flex-col justify-end items-center flex-1 min-w-0 text-xs text-gray-600"> {/* Added justify-end */}
          <div
            className={`w-full rounded-t ${bin.isCorrectBin ? 'bg-green-600' : 'bg-blue-500'} text-white flex items-center justify-center text-sm font-bold transition-all duration-300 ease-in-out`}
            style={{ height: `${(bin.count / maxCount) * 100}%`, minHeight: '5px' }} // This height is now a % of the column's full height (h-48)
            title={`Range: ${bin.label}\nCount: ${bin.count}`}
          >
            {bin.count > 0 ? bin.count : ''}
          </div>
          <span className="mt-1 whitespace-nowrap">{bin.label}</span>
        </div>
        ))}
      </div>
      {correctBinIndex !== undefined && bins[correctBinIndex] && (
        <p className="text-xs text-center mt-3 text-gray-600">
          Correct Answer ({correctAnswerValue}%) falls in the <span className="font-bold" style={{color: 'rgb(22, 163, 74)'}}>green bin ({bins[correctBinIndex].label})</span>.
        </p>
      )}
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
      if (gameStateDoc.empty || !gameStateDoc.docs[0].exists) { // Ensure document exists
        await initializeGameState();
      }

      // Set up real-time listeners
      const gameStateUnsubscribe = onSnapshot(
        doc(db, 'gameStates', 'current'),
        (docSnap) => {
          const gameData = docSnap.data();
          if (gameData) {
            setGamePhase(gameData.phase);
            setCurrentQuestion(gameData.currentQuestion);
          } else {
            // Game state document was deleted, re-initialize
            initializeGameState();
          }
        },
        (error) => {
          console.error("Error listening to game state:", error);
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
        },
        (error) => {
          console.error("Error listening to students:", error);
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
    // Before starting a new question, ensure all students' submitted status is false
    // and answers are cleared for the next round if not already handled
    await Promise.all(
      students.map((student) =>
        updateDoc(doc(db, 'students', student.id), {
          submitted: false,
          // We no longer need to clear answers, as they are stored per question ID
        })
      )
    );

    await updateDoc(doc(db, 'gameStates', 'current'), {
      phase: 'question',
      currentQuestion,
    });
  };

  const showResults = async () => {
    const currentQuestionData = questions[currentQuestion - 1];
    
    // Calculate and update scores for all students
    const updatePromises = students.map(async (student) => {
      const studentDocRef = doc(db, 'students', student.id);
      const studentDoc = await getDoc(studentDocRef);
      const existingStudentData = studentDoc.data();

      // Get the student's answer for the current question, default to 50 if not provided
      const prediction = Number(existingStudentData.answers?.[currentQuestionData.id]) || 50; 
      
      const currentScore = Math.abs(currentQuestionData.answer - prediction);
      const predictionDiff = prediction - currentQuestionData.answer; // Signed difference

      // Ensure predictionDiffs is an array and add the new diff
      const existingDiffs = Array.isArray(existingStudentData.predictionDiffs) ? existingStudentData.predictionDiffs : [];
      const newDiffs = [...existingDiffs, predictionDiff];
      
      return updateDoc(studentDocRef, {
        currentScore: currentScore,
        totalScore: (existingStudentData.totalScore || 0) + currentScore,
        predictionDiffs: newDiffs // Store the differences array
      });
    });

    await Promise.all(updatePromises);

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

      // Reset student submissions (already done in startQuestion, but good to ensure)
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
    if (window.confirm("Are you sure you want to reset the entire game? This will delete all student data and scores.")) {
      try {
        await initializeGameState();
        console.log("Game reset initiated successfully.");
      } catch (error) {
        console.error('Error resetting game:', error);
        alert('Failed to reset game. Check console for details.');
      }
    }
  };

  const renderStudentList = () => {
    // Sort students based on game phase
    const sortedStudents = [...students].sort((a, b) => {
      // For results phase, sort by current round's absolute score (lower is better)
      if (gamePhase === 'results') {
        return Math.abs(a.currentScore || 0) - Math.abs(b.currentScore || 0);
      } else {
        // For 'registration', 'question', and 'final', sort by total absolute score (lower is better)
        return Math.abs(a.totalScore || 0) - Math.abs(b.totalScore || 0);
      }
    });
  
    return (
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Round Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Score</th>
              {(gamePhase === 'results' || gamePhase === 'final') && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">All Predictions (Diffs)</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedStudents.map((student) => {
              const currentQuestionData = questions[currentQuestion - 1];
              const studentPredictionForCurrentRound = student.answers?.[currentQuestionData?.id];

              return (
                <tr
                  key={student.id}
                  className={student.submitted ? 'bg-green-50' : (gamePhase === 'question' ? 'bg-yellow-50' : '')}
                >
                  <td className="px-4 py-3 whitespace-nowrap">{student.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {gamePhase === 'question' ? (
                      student.submitted ? 'Submitted' : 'Waiting...'
                    ) : (gamePhase === 'results' || gamePhase === 'final' ? (studentPredictionForCurrentRound !== undefined ? `Answered: ${studentPredictionForCurrentRound}%` : 'N/A') : '')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {gamePhase === 'results' || gamePhase === 'final'
                      ? (student.currentScore || 0)
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {(student.totalScore || 0)}
                  </td>
                  {(gamePhase === 'results' || gamePhase === 'final') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {student.predictionDiffs && Array.isArray(student.predictionDiffs) ? 
                        student.predictionDiffs
                          .sort((a, b) => a - b) // Sort from most negative to most positive
                          .map((diff, index) => {
                            let color;
                            if (diff < -10) color = 'rgb(220, 38, 38)'; // Strong red
                            else if (diff < -5) color = 'rgb(239, 68, 68)'; // Medium red
                            else if (diff < 0) color = 'rgb(252, 165, 165)'; // Light red
                            else if (diff === 0) color = 'rgb(0, 0, 0)'; // Black
                            else if (diff <= 5) color = 'rgb(134, 239, 172)'; // Light green
                            else if (diff <= 10) color = 'rgb(34, 197, 94)'; // Medium green
                            else color = 'rgb(22, 163, 74)'; // Strong green
  
                            return (
                              <span 
                                key={`${student.id}-${diff}-${index}`} // Unique key for each span
                                className="inline-block mx-1" // Use inline-block for spacing
                                style={{ color }}
                              >
                                {diff > 0 ? `+${Math.round(diff)}%` : `${Math.round(diff)}%`}
                              </span>
                            );
                          })
                        : ''}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {students.length === 0 && (
          <p className="p-4 text-center text-gray-500">No students registered yet.</p>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Admin Panel</h1>
        <button
          onClick={resetGame}
          className="bg-red-600 text-white px-5 py-2 rounded-md hover:bg-red-700 transition duration-200 shadow-md"
        >
          Reset Game
        </button>
      </div>

      {gamePhase === 'registration' && (
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Registered Students</h2>
          {renderStudentList()}
          <button
            onClick={startQuestion}
            className="mt-6 w-full bg-blue-600 text-white px-5 py-3 rounded-md text-lg font-semibold hover:bg-blue-700 transition duration-200 shadow-md"
            disabled={students.length === 0}
          >
            Start Question {currentQuestion}
          </button>
          {students.length === 0 && <p className="text-center text-gray-500 mt-2">Waiting for students to register...</p>}
        </div>
      )}

      {gamePhase === 'question' && (
        <div className="bg-purple-50 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4 text-purple-800">Current Question ({currentQuestion}/{questions.length})</h2>
          <p className="mb-4 text-lg font-medium">{questions[currentQuestion - 1].question}</p>
          {renderStudentList()}
          <button
            onClick={showResults}
            className="mt-6 w-full bg-purple-600 text-white px-5 py-3 rounded-md text-lg font-semibold hover:bg-purple-700 transition duration-200 shadow-md"
          >
            Show Results for Question {currentQuestion}
          </button>
        </div>
      )}

{gamePhase === 'results' && (
        <div className="bg-green-50 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4 text-green-800">Results for Question {currentQuestion}</h2>
          <p className="mb-4 text-lg font-medium">Correct Answer: {questions[currentQuestion - 1].answer}%</p>
          {renderStudentList()}

          {/* === ADD THIS SECTION FOR THE HISTOGRAM === */}
          {(() => {
            // Ensure renderResponseHistogram is accessible in this scope
            // (defined above the Admin component, or as a nested helper)

            const currentQuestionData = questions[currentQuestion - 1];
            if (!currentQuestionData) return null; // Should not happen if phase is 'results'

            // Extract predictions for the current question from all students
            const predictionsForCurrentQuestion = students
              .map(student => student.answers?.[currentQuestionData.id])
              .filter(pred => typeof pred === 'number' && !isNaN(pred)); // Filter for valid numbers

            return renderResponseHistogram(predictionsForCurrentQuestion, currentQuestionData.answer);
          })()}
          {/* === END HISTOGRAM SECTION === */}

          <button
            onClick={nextQuestion}
            className="mt-6 w-full bg-green-600 text-white px-5 py-3 rounded-md text-lg font-semibold hover:bg-green-700 transition duration-200 shadow-md"
          >
            {currentQuestion < questions.length
              ? `Next Question (${currentQuestion + 1}/${questions.length})`
              : 'Show Final Results'}
          </button>
        </div>
      )}

      {gamePhase === 'final' && (
        <div className="bg-yellow-50 p-6 rounded-lg mb-6">
          <h2 className="text-2xl font-extrabold mb-4 text-yellow-800 text-center">Final Results!</h2>
          <p className="text-center text-lg mb-4 text-yellow-700">Congratulations to the winner!</p>
          {renderStudentList()}
          <div className="mt-6 text-center">
            {students.length > 0 && (
              <p className="text-xl font-bold text-gray-800">
                Winner: {students.reduce((prev, curr) => (
                  Math.abs(prev.totalScore || 0) < Math.abs(curr.totalScore || 0) ? prev : curr
                )).name} (Total Score: {students.reduce((prev, curr) => (
                  Math.abs(prev.totalScore || 0) < Math.abs(curr.totalScore || 0) ? prev : curr
                )).totalScore})
              </p>
            )}
          </div>
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