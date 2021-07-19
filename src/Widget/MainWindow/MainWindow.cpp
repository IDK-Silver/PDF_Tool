//
// Created by IDK-Silver on 2021/7/19.
//

// You may need to build the project (run Qt uic code generator) to get "ui_MainWindow.h" resolved

#include "MainWindow.h"
#include "ui_MainWindow.h"



MainWindow::MainWindow(QWidget *parent) :
        QMainWindow(parent), ui(new Ui::MainWindow) {
    ui->setupUi(this);
    setCentralWidget(this->pdfWidget);
}

MainWindow::~MainWindow() {
    delete ui;
}

