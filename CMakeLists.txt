cmake_minimum_required(VERSION 3.2)

project(PDF_Tool LANGUAGES CXX)

set(TARGET_NAME ${PROJECT_NAME}) 
set(MINGW_BIN_PATH "C:/Development/msys2/mingw64/bin")
set(other_library_path "C:/Development/msys2/mingw64")

set(Win32_dll "libpoppler-105.dll" "libpoppler-cpp-0.dll")

include_directories(${other_library_path}/include)
link_directories(${other_library_path}/lib)



set(CMAKE_INCLUDE_CURRENT_DIR ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(PROJECT_SOURCES
    src/main.cpp
    src/Widget/MainWindow/MainWindow.h src/Widget/MainWindow/MainWindow.cpp src/Widget/MainWindow/MainWindow.ui
    
)


find_package(QT NAMES Qt6 Qt5 COMPONENTS Widgets REQUIRED)
find_package(Qt${QT_VERSION_MAJOR} COMPONENTS Widgets REQUIRED)


add_executable(PDF_Tool ${PROJECT_SOURCES})



target_link_libraries(PDF_Tool PRIVATE Qt${QT_VERSION_MAJOR}::Widgets poppler-qt5 poppler-cpp)

if (WIN32)
    foreach(dll ${Win32_dll})
        set(LIBGCC_DLL "${MINGW_BIN_PATH}/${dll}") 
        add_custom_command(TARGET ${TARGET_NAME} PRE_BUILD 
        COMMAND ${CMAKE_COMMAND} -E copy 
        ${LIBGCC_DLL} $<TARGET_FILE_DIR:${TARGET_NAME}>) 
    endforeach()
endif()




