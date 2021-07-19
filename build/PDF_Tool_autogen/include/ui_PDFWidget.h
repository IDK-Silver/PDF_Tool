/********************************************************************************
** Form generated from reading UI file 'PDFWidget.ui'
**
** Created by: Qt User Interface Compiler version 5.15.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_PDFWIDGET_H
#define UI_PDFWIDGET_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_PDFWidget
{
public:
    QPushButton *pushButton;
    QPushButton *pushButton_2;

    void setupUi(QWidget *PDFWidget)
    {
        if (PDFWidget->objectName().isEmpty())
            PDFWidget->setObjectName(QString::fromUtf8("PDFWidget"));
        PDFWidget->resize(400, 300);
        pushButton = new QPushButton(PDFWidget);
        pushButton->setObjectName(QString::fromUtf8("pushButton"));
        pushButton->setGeometry(QRect(200, 110, 93, 28));
        pushButton_2 = new QPushButton(PDFWidget);
        pushButton_2->setObjectName(QString::fromUtf8("pushButton_2"));
        pushButton_2->setGeometry(QRect(90, 210, 93, 28));

        retranslateUi(PDFWidget);

        QMetaObject::connectSlotsByName(PDFWidget);
    } // setupUi

    void retranslateUi(QWidget *PDFWidget)
    {
        PDFWidget->setWindowTitle(QCoreApplication::translate("PDFWidget", "PDFWidget", nullptr));
        pushButton->setText(QCoreApplication::translate("PDFWidget", "PushButton", nullptr));
        pushButton_2->setText(QCoreApplication::translate("PDFWidget", "PushButton", nullptr));
    } // retranslateUi

};

namespace Ui {
    class PDFWidget: public Ui_PDFWidget {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_PDFWIDGET_H
